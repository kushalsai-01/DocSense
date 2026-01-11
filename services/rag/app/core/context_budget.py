from __future__ import annotations

from dataclasses import dataclass

from app.retriever.qdrant_retriever import RetrievedChunk


@dataclass
class ContextBudget:
    """Manages token budget for LLM context.

    Ensures that context fits within token limits by intelligently
    selecting and trimming chunks.
    """

    max_tokens: int
    reserved_for_prompt: int = 500  # Reserve tokens for system/user prompts
    reserved_for_response: int = 1000  # Reserve tokens for LLM response
    average_chars_per_token: float = 4.0  # Rough estimate: 1 token ≈ 4 chars

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count from text length.

        Uses character-based estimation (rough but fast).
        For production, consider using tiktoken or similar.
        """
        return int(len(text) / self.average_chars_per_token)

    def get_available_budget(self) -> int:
        """Calculate available tokens for context after reserves."""
        return self.max_tokens - self.reserved_for_prompt - self.reserved_for_response

    def select_chunks(
        self, chunks: list[RetrievedChunk], max_chunks: int | None = None
    ) -> list[RetrievedChunk]:
        """Select chunks that fit within token budget.

        Prioritizes high-score chunks and ensures context fits within limits.
        """
        available = self.get_available_budget()
        if available <= 0:
            return []

        selected: list[RetrievedChunk] = []
        total_tokens = 0

        # Sort by score (highest first) to prioritize relevant chunks
        sorted_chunks = sorted(chunks, key=lambda c: c.score, reverse=True)

        # Apply max_chunks limit if specified
        if max_chunks is not None:
            sorted_chunks = sorted_chunks[:max_chunks]

        for chunk in sorted_chunks:
            if not chunk.text:
                continue

            chunk_tokens = self.estimate_tokens(chunk.text)
            if total_tokens + chunk_tokens <= available:
                selected.append(chunk)
                total_tokens += chunk_tokens
            else:
                # Try to fit a trimmed version if it's the first chunk
                if not selected:
                    trimmed_text = self._trim_to_fit(chunk.text, available)
                    if trimmed_text:
                        # Create a new chunk with trimmed text
                        trimmed_chunk = RetrievedChunk(
                            id=chunk.id,
                            score=chunk.score,
                            document_id=chunk.document_id,
                            text=trimmed_text,
                            chunk_index=chunk.chunk_index,
                        )
                        selected.append(trimmed_chunk)
                break

        return selected

    def _trim_to_fit(self, text: str, max_tokens: int) -> str | None:
        """Trim text to fit within token budget.

        Tries to preserve meaning by trimming from the middle,
        keeping beginning and end.
        """
        max_chars = int(max_tokens * self.average_chars_per_token)
        if len(text) <= max_chars:
            return text

        # For very small budgets, just take the beginning
        if max_chars < 100:
            return text[:max_chars] + "..."

        # Try to preserve beginning and end
        prefix_chars = max_chars // 2
        suffix_chars = max_chars - prefix_chars - 10  # Reserve for "..."
        return text[:prefix_chars] + "..." + text[-suffix_chars:]

    def build_context_string(self, chunks: list[RetrievedChunk]) -> str:
        """Build context string from selected chunks.

        Formats chunks with clear separators for LLM parsing.
        """
        if not chunks:
            return ""

        parts = []
        for i, chunk in enumerate(chunks, 1):
            if chunk.text:
                parts.append(f"[Chunk {i}]\n{chunk.text}\n")
        return "\n".join(parts)
