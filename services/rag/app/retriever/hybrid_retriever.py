"""
Hybrid Retriever — Fuses vector + BM25 results using Reciprocal Rank Fusion.

WHY hybrid retrieval?
─────────────────────
Neither vector search nor BM25 alone is perfect:

  • Vector search captures MEANING but can miss exact keywords.
    Example: query "error code 0x8007" → vector search might return
    generic "error handling" docs instead of the exact error code.

  • BM25 captures exact KEYWORDS but misses semantic relationships.
    Example: query "how to fix authentication issues" → BM25 misses
    docs that say "login problems" because the exact words differ.

By combining both, we dramatically improve recall — the hybrid approach
consistently outperforms either method alone in IR benchmarks.

Reciprocal Rank Fusion (RRF):
  RRF is the simplest effective method to merge ranked lists from
  different retrieval systems.  For each chunk appearing in any list:

    RRF_score(chunk) = Σ  1 / (k + rank_in_list_i)

  where k=60 (a constant that prevents high-ranked items from
  dominating too aggressively) and rank is 1-indexed.

  WHY RRF over other fusion methods (like CombSUM)?
    • Score-agnostic: BM25 scores range 0–50+, cosine similarity 0–1.
      RRF doesn't need score normalisation, it only uses RANK positions.
    • Simple: No hyperparameters to tune except k (60 works well empirically).
    • Proven: Used in Elasticsearch, Azure Cognitive Search, etc.

Reranking with Cohere:
  After RRF fusion, we take the top 20 and rerank them with a
  cross-encoder model via Cohere's API.  Cross-encoders are much
  more accurate than bi-encoders (used in vector search) because
  they see the query AND document TOGETHER, allowing fine-grained
  token-level attention.  But they're too slow to run on the full
  corpus — hence the two-stage pipeline: cheap retrieval → expensive reranking.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from app.retriever.qdrant_retriever import QdrantRetriever, RetrievedChunk
from app.retriever.bm25_retriever import BM25Retriever, BM25Result

logger = logging.getLogger(__name__)

# ── RRF constant ────────────────────────────────────────────────────────
# WHY 60?  This value was proposed in the original RRF paper
# (Cormack et al., 2009).  It balances giving credit to top-ranked items
# while still allowing lower-ranked items to contribute meaningfully.
# Smaller k → more weight to top ranks.  Larger k → more uniform weight.
_RRF_K = 60


@dataclass(frozen=True)
class HybridResult:
    """
    A search result from the hybrid pipeline with all metadata intact.

    This is the final output consumed by context_budget.py and llm_generator.py.
    Every field from both retrieval backends is preserved so that the
    LLM response can include precise citations with page numbers,
    character offsets for highlighting, etc.
    """

    chunk_id: str
    chunk_text: str
    score: float  # Final score (RRF or reranker relevance score)
    doc_id: str
    doc_name: str | None = None
    page_num: int | None = None
    section_title: str | None = None
    char_start: int | None = None
    char_end: int | None = None
    chunk_index: int | None = None


class HybridRetriever:
    """
    Three-layer retrieval pipeline:
      1. Vector search   (semantic meaning)     — QdrantRetriever
      2. BM25 search     (exact keyword match)   — BM25Retriever
      3. Cohere reranking (cross-encoder scoring) — Cohere API

    The flow:
      query → [vector, BM25] in parallel → RRF fusion → top-20 → rerank → top-5
    """

    def __init__(
        self,
        qdrant_retriever: QdrantRetriever,
        bm25_retriever: BM25Retriever,
    ):
        self._qdrant = qdrant_retriever
        self._bm25 = bm25_retriever

        # ── Lazy-initialise Cohere client ──────────────────────────
        # WHY lazy?  The Cohere API key might not be set in dev environments.
        # We only pay the import / init cost if reranking is actually used.
        self._cohere_client = None
        self._cohere_available = None  # None = not checked yet

    # ── Main search entry point ─────────────────────────────────────

    async def search(
        self,
        query: str,
        workspace_id: str,
        top_k: int = 20,
        final_top_n: int = 5,
        filter_by_doc_ids: Optional[list[str]] = None,
    ) -> list[HybridResult]:
        """
        Execute the full hybrid retrieval pipeline.

        Args:
            query: User's search query.
            workspace_id: Workspace to search in (used by BM25 for Redis key).
            top_k: Number of candidates from each retrieval backend (default 20).
            final_top_n: Number of final results after reranking (default 5).
            filter_by_doc_ids: Optional doc ID filter passed to vector search.

        Returns:
            Top-N HybridResult objects sorted by final relevance score.
        """

        # ── Step A: Run both retrieval backends in PARALLEL ────────
        # WHY parallel?  Vector search hits Qdrant (network I/O) and
        # BM25 hits Redis (network I/O).  Running them concurrently
        # cuts latency roughly in half vs. sequential execution.
        vector_results, bm25_results = await asyncio.gather(
            self._run_vector_search(query, workspace_id, top_k, filter_by_doc_ids),
            self._bm25.search(query, workspace_id, top_k),
        )

        logger.info(
            "Hybrid search: %d vector results, %d BM25 results",
            len(vector_results),
            len(bm25_results),
        )

        # ── Step B: Reciprocal Rank Fusion ─────────────────────────
        fused = self._reciprocal_rank_fusion(vector_results, bm25_results)

        # ── Step C: Take top-20 candidates for reranking ───────────
        candidates = fused[:top_k]

        if not candidates:
            return []

        # ── Step D: Rerank with Cohere (if available) ──────────────
        reranked = await self._rerank(query, candidates, final_top_n)

        # ── Step E: Return final top-N ─────────────────────────────
        return reranked

    # ── Vector search wrapper (sync → async) ────────────────────────

    async def _run_vector_search(
        self,
        query: str,
        workspace_id: str,
        top_k: int,
        filter_by_doc_ids: Optional[list[str]],
    ) -> list[RetrievedChunk]:
        """
        Run Qdrant vector search in an executor thread.

        WHY run_in_executor?  QdrantRetriever.query() is synchronous
        (uses the sync qdrant-client).  Running it in a thread prevents
        it from blocking the asyncio event loop, which would stall
        the concurrent BM25 search.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._qdrant.query(
                query_text=query,
                top_k=top_k,
                workspace_id=workspace_id,
                filter_by_doc_ids=filter_by_doc_ids,
            ),
        )

    # ── Reciprocal Rank Fusion ──────────────────────────────────────

    def _reciprocal_rank_fusion(
        self,
        vector_results: list[RetrievedChunk],
        bm25_results: list[BM25Result],
    ) -> list[HybridResult]:
        """
        Merge two ranked result lists using RRF.

        For each chunk, we sum  1 / (60 + rank)  across all lists
        in which it appears.  A chunk in position 1 of both lists gets:
          1/(60+1) + 1/(60+1) = 2/61 ≈ 0.0328

        A chunk in position 1 of vector but absent from BM25 gets:
          1/(60+1) + 0 = 1/61 ≈ 0.0164

        This naturally rewards chunks that appear in BOTH lists
        (likely to be genuinely relevant) while still including
        chunks from only one list if they rank high enough.
        """

        # Accumulate RRF scores and metadata keyed by chunk_id
        rrf_scores: dict[str, float] = defaultdict(float)
        chunk_data: dict[str, HybridResult] = {}

        # ── Score vector search results ────────────────────────────
        for rank, chunk in enumerate(vector_results, start=1):
            chunk_id = chunk.id
            rrf_scores[chunk_id] += 1.0 / (_RRF_K + rank)

            # Store metadata (vector results have the richest metadata)
            if chunk_id not in chunk_data:
                chunk_data[chunk_id] = HybridResult(
                    chunk_id=chunk_id,
                    chunk_text=chunk.text or "",
                    score=0.0,  # Will be set after summation
                    doc_id=chunk.document_id or "",
                    doc_name=chunk.doc_name,
                    page_num=chunk.page_num,
                    section_title=chunk.section_title,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                    chunk_index=chunk.chunk_index,
                )

        # ── Score BM25 results ─────────────────────────────────────
        for rank, result in enumerate(bm25_results, start=1):
            chunk_id = result.chunk_id
            rrf_scores[chunk_id] += 1.0 / (_RRF_K + rank)

            # BM25 results might surface chunks not found by vector search
            if chunk_id not in chunk_data:
                chunk_data[chunk_id] = HybridResult(
                    chunk_id=chunk_id,
                    chunk_text=result.chunk_text,
                    score=0.0,
                    doc_id=result.doc_id,
                    page_num=result.page_num,
                )

        # ── Build final list sorted by RRF score ──────────────────
        fused_results: list[HybridResult] = []
        for chunk_id, rrf_score in sorted(
            rrf_scores.items(), key=lambda x: x[1], reverse=True
        ):
            data = chunk_data[chunk_id]
            # Create new HybridResult with the computed RRF score
            fused_results.append(
                HybridResult(
                    chunk_id=data.chunk_id,
                    chunk_text=data.chunk_text,
                    score=rrf_score,
                    doc_id=data.doc_id,
                    doc_name=data.doc_name,
                    page_num=data.page_num,
                    section_title=data.section_title,
                    char_start=data.char_start,
                    char_end=data.char_end,
                    chunk_index=data.chunk_index,
                )
            )

        return fused_results

    # ── Cohere Reranking ────────────────────────────────────────────

    async def _rerank(
        self,
        query: str,
        candidates: list[HybridResult],
        top_n: int,
    ) -> list[HybridResult]:
        """
        Rerank candidates using Cohere's cross-encoder model.

        WHY cross-encoder reranking?
          Bi-encoders (used in vector search) encode query and document
          INDEPENDENTLY.  This is fast but loses query-document interaction.
          Cross-encoders encode query + document TOGETHER, seeing all
          token-level interactions — much more accurate but 100x slower.

          Solution: use the cheap bi-encoder to get 20 candidates,
          then the expensive cross-encoder to pick the best 5.
          This 2-stage approach is industry standard (used by Pinecone,
          Weaviate, Vespa, etc.).

        Falls back to top-N by RRF score if COHERE_API_KEY is not set
        (graceful degradation for local development).
        """
        if not self._is_cohere_available():
            logger.info(
                "Cohere reranking unavailable (no API key) — "
                "returning top %d by RRF score",
                top_n,
            )
            return candidates[:top_n]

        try:
            texts = [c.chunk_text for c in candidates]

            # WHY run_in_executor?  The Cohere SDK is synchronous.
            loop = asyncio.get_event_loop()
            rerank_response = await loop.run_in_executor(
                None,
                lambda: self._cohere_client.rerank(
                    query=query,
                    documents=texts,
                    top_n=top_n,
                    model="rerank-english-v3.0",
                ),
            )

            # Map reranked results back to our HybridResult objects
            reranked: list[HybridResult] = []
            for item in rerank_response.results:
                original = candidates[item.index]
                reranked.append(
                    HybridResult(
                        chunk_id=original.chunk_id,
                        chunk_text=original.chunk_text,
                        score=float(item.relevance_score),
                        doc_id=original.doc_id,
                        doc_name=original.doc_name,
                        page_num=original.page_num,
                        section_title=original.section_title,
                        char_start=original.char_start,
                        char_end=original.char_end,
                        chunk_index=original.chunk_index,
                    )
                )

            logger.info(
                "Cohere reranking complete: %d → %d results",
                len(candidates),
                len(reranked),
            )
            return reranked

        except Exception as exc:
            # WHY catch-all?  Reranking is an ENHANCEMENT, not a requirement.
            # If Cohere is down / rate-limited / errors out, we still return
            # usable results from RRF.  The user's query should never fail
            # just because a reranking API had an issue.
            logger.warning(
                "Cohere reranking failed, falling back to RRF scores: %s", exc
            )
            return candidates[:top_n]

    def _is_cohere_available(self) -> bool:
        """
        Check if Cohere reranking is available (API key set).
        Result is cached after first check to avoid repeated env lookups.
        """
        if self._cohere_available is not None:
            return self._cohere_available

        api_key = os.environ.get("COHERE_API_KEY")
        if not api_key:
            self._cohere_available = False
            return False

        try:
            import cohere

            self._cohere_client = cohere.Client(api_key)
            self._cohere_available = True
            logger.info("Cohere reranking enabled")
        except ImportError:
            logger.warning(
                "cohere package not installed — reranking disabled"
            )
            self._cohere_available = False

        return self._cohere_available
