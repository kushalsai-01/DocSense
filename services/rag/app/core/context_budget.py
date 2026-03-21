"""
Context Budget — Controls how many chunks enter the LLM prompt.

WHY budget tokens?
──────────────────
LLMs have a finite context window (e.g. 8k, 32k, 128k tokens).
If we stuff too many chunks in, we:
  1. Exceed the context window → API error
  2. Dilute relevant info with noise → worse answer quality
  3. Pay more per query (token-based pricing)

The context budget ensures we select the MOST relevant chunks that
FIT within our token allocation.

UPGRADE NOTES:
  • max_chunks default raised to 5 (from 10 on settings, but we now
    receive exactly 5 from hybrid_retriever after reranking).
  • Added chunk DEDUPLICATION: if two chunks share >80% token overlap,
    we keep only the higher-scored one.  WHY?  Overlapping chunks waste
    context budget without adding new information — they occur when
    chunking uses a sliding window with overlap, or when the same
    paragraph appears in multiple document sections.
  • Metadata passthrough: every chunk dict that enters context_budget
    must exit with its full metadata intact (doc_id, page_num, char_start,
    char_end) — these are needed downstream for citation highlighting.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.retriever.qdrant_retriever import RetrievedChunk


@dataclass
class ContextBudget:
    """
    Manages token allocation for the LLM context window.

    Splits the total budget into three zones:
      [reserved_for_prompt | available for chunks | reserved_for_response]

    Only the middle zone is used for retrieved chunks.
    """

    max_tokens: int
    reserved_for_prompt: int = 500
    reserved_for_response: int = 1000
    average_chars_per_token: float = 4.0

    def estimate_tokens(self, text: str) -> int:
        """
        Rough token count estimate.

        WHY chars/4 instead of a real tokeniser?
          • Speed: tiktoken adds ~5ms per call; char division is instant.
          • Accuracy: chars/4 is within 10% for English text, which is
            good enough for budget decisions (not billing).
          • No dependency on a specific model's tokeniser.
        """
        return int(len(text) / self.average_chars_per_token)

    def get_available_budget(self) -> int:
        """Tokens available for chunk text after reserving prompt + response space."""
        return self.max_tokens - self.reserved_for_prompt - self.reserved_for_response

    def select_chunks(
        self, chunks: list[RetrievedChunk], max_chunks: int | None = None
    ) -> list[RetrievedChunk]:
        """
        Select the best chunks that fit within the token budget.

        Pipeline:
          1. Sort by score (highest first) — most relevant chunks get priority.
          2. Deduplicate: remove chunks with >80% token overlap with
             any already-selected chunk.
          3. Greedily add chunks until the budget is exhausted.

        The max_chunks parameter defaults to 5 (matching the hybrid
        retriever's final output size), but can be overridden.

        IMPORTANT: All metadata fields on each RetrievedChunk are
        preserved through this function.  The only field that MAY
        change is `text` (if the first chunk needs trimming to fit).
        """
        if max_chunks is None:
            max_chunks = 5  # Default: matches hybrid retriever's top-N

        available = self.get_available_budget()
        if available <= 0:
            return []

        selected: list[RetrievedChunk] = []
        total_tokens = 0

        # Sort by score descending — highest relevance first
        sorted_chunks = sorted(chunks, key=lambda c: c.score, reverse=True)
        if max_chunks is not None:
            sorted_chunks = sorted_chunks[:max_chunks]

        for chunk in sorted_chunks:
            if not chunk.text:
                continue

            # ── Deduplication check ────────────────────────────────
            # WHY 80% threshold?  Lower thresholds (e.g. 50%) would
            # aggressively deduplicate chunks that share common boilerplate
            # but contain different key information.  Higher thresholds
            # (e.g. 95%) would let near-identical chunks through.
            # 80% is a sweet spot found empirically in RAG pipelines.
            if self._is_duplicate(chunk, selected):
                continue

            chunk_tokens = self.estimate_tokens(chunk.text)

            if total_tokens + chunk_tokens <= available:
                selected.append(chunk)
                total_tokens += chunk_tokens
            else:
                # If we haven't selected ANY chunk yet and this one is
                # too large, trim it rather than returning empty context.
                if not selected:
                    trimmed_text = self._trim_to_fit(chunk.text, available)
                    if trimmed_text:
                        # Create a new chunk with trimmed text but
                        # ALL original metadata preserved
                        trimmed_chunk = RetrievedChunk(
                            id=chunk.id,
                            score=chunk.score,
                            document_id=chunk.document_id,
                            text=trimmed_text,
                            chunk_index=chunk.chunk_index,
                            doc_name=chunk.doc_name,
                            page_num=chunk.page_num,
                            section_title=chunk.section_title,
                            char_start=chunk.char_start,
                            char_end=chunk.char_end,
                        )
                        selected.append(trimmed_chunk)
                break

        return selected

    def _is_duplicate(
        self, candidate: RetrievedChunk, selected: list[RetrievedChunk]
    ) -> bool:
        """
        Check if a candidate chunk has >80% token overlap with any selected chunk.

        WHY token-level overlap instead of text equality?
          Two chunks might contain 90% identical text with slight differences
          at the boundaries (due to sliding-window chunking).  Exact string
          comparison would miss these near-duplicates, wasting context budget.

        Method:
          We tokenise both chunks (simple whitespace split — fast and sufficient
          for overlap detection) and compute the Jaccard-like overlap ratio:
            overlap_ratio = |intersection| / |smaller set|

          Using the SMALLER set as the denominator means a short chunk that is
          entirely contained within a longer chunk is flagged as a duplicate,
          which is the correct behaviour.
        """
        if not candidate.text:
            return False

        candidate_tokens = set(candidate.text.lower().split())
        if not candidate_tokens:
            return False

        for existing in selected:
            if not existing.text:
                continue

            existing_tokens = set(existing.text.lower().split())
            if not existing_tokens:
                continue

            intersection = candidate_tokens & existing_tokens
            # Use the smaller set as denominator to catch containment cases
            smaller_size = min(len(candidate_tokens), len(existing_tokens))

            if smaller_size == 0:
                continue

            overlap_ratio = len(intersection) / smaller_size

            if overlap_ratio > 0.80:
                return True

        return False

    def _trim_to_fit(self, text: str, max_tokens: int) -> str | None:
        """
        Trim text to fit within a token budget, keeping start + end.

        WHY keep both start and end?
          Document chunks often have important information at both
          the beginning (topic sentence) and the end (conclusion/summary).
          A simple truncation would lose the ending.  By keeping both
          extremes with "..." in the middle, we preserve more signal.
        """
        max_chars = int(max_tokens * self.average_chars_per_token)

        if len(text) <= max_chars:
            return text

        if max_chars < 100:
            return text[:max_chars] + "..."

        prefix_chars = max_chars // 2
        suffix_chars = max_chars - prefix_chars - 10
        return text[:prefix_chars] + "..." + text[-suffix_chars:]

    def build_context_string(self, chunks: list[RetrievedChunk]) -> str:
        """
        Format selected chunks into a single context string for the LLM prompt.

        Each chunk is labelled [Document N] with metadata annotation so the
        LLM can reference specific sources.  The metadata is included as a
        comment line that the LLM can optionally use for attribution.
        """
        if not chunks:
            return ""

        parts = []
        for i, chunk in enumerate(chunks, 1):
            if chunk.text:
                # Include metadata as a source annotation
                # WHY?  This helps the LLM cite specific pages/sections
                # when generating answers, improving answer traceability.
                meta_parts = []
                if chunk.document_id:
                    meta_parts.append(f"doc_id={chunk.document_id}")
                if chunk.doc_name:
                    meta_parts.append(f"doc={chunk.doc_name}")
                if chunk.page_num is not None:
                    meta_parts.append(f"page={chunk.page_num}")
                if chunk.section_title:
                    meta_parts.append(f"section={chunk.section_title}")

                meta_line = (
                    f"  [Source: {', '.join(meta_parts)}]\n"
                    if meta_parts
                    else ""
                )

                parts.append(
                    f"[Document {i}]\n{meta_line}{chunk.text}\n"
                )

        return "\n---\n".join(parts)
