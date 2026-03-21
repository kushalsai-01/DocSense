"""
BM25 Retriever — Keyword-based search layer for the hybrid retrieval pipeline.

WHY BM25 alongside vector search?
──────────────────────────────────
Vector search (dense retrieval) is excellent at capturing *semantic meaning* —
it understands that "automobile" and "car" are related. However, it can MISS
exact keyword matches that matter in technical or domain-specific contexts.

BM25 (Best Matching 25) is a *sparse* retrieval method based on term frequency.
It excels at finding documents that contain the exact words in the query.
By combining both, we get the best of both worlds (→ hybrid_retriever.py).

BM25Okapi specifically uses:
  score(D, Q) = Σ IDF(qi) · [ f(qi,D) · (k1+1) ] / [ f(qi,D) + k1 · (1 - b + b · |D|/avgdl) ]
  where k1 and b control term-frequency saturation and length normalization.

Index storage:
  We serialize the BM25 index to Redis as JSON so it persists across restarts
  and can be shared across multiple worker processes. The key pattern is:
    bm25:{workspace_id}:index
"""

from __future__ import annotations

import json
import logging
import os
import re
import string
from dataclasses import dataclass, field

from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tokenizer — intentionally simple but effective
# ---------------------------------------------------------------------------
# WHY stemming?  Without stemming, "running" and "runs" are treated as
# completely different tokens.  Porter stemming reduces them both to "run",
# which dramatically improves recall for keyword search.
# ---------------------------------------------------------------------------

try:
    from nltk.stem import PorterStemmer

    _stemmer = PorterStemmer()
except ImportError:
    # Graceful fallback: if nltk isn't installed yet, stemming is skipped.
    _stemmer = None
    logger.warning("nltk not installed — BM25 tokenizer will skip stemming")

# Pre-compile a regex that strips punctuation — faster than str.translate in bulk
_PUNCT_RE = re.compile(f"[{re.escape(string.punctuation)}]")


def tokenize(text: str) -> list[str]:
    """
    Tokenize text for BM25 indexing / querying.

    Pipeline:
      1. Lowercase  → case-insensitive matching
      2. Remove punctuation → "don't" → "dont" (avoids split issues)
      3. Whitespace split → simple, language-agnostic word boundaries
      4. Porter stemming → normalise morphological variants

    WHY this order?  Lowercasing before punctuation removal avoids edge cases
    with characters like 'İ' in Turkish.  Stemming last ensures we stem the
    cleaned tokens, not raw text with punctuation artifacts.
    """
    text = text.lower()
    text = _PUNCT_RE.sub("", text)
    tokens = text.split()

    if _stemmer is not None:
        tokens = [_stemmer.stem(t) for t in tokens]

    return tokens


# ---------------------------------------------------------------------------
# Data class for search results — mirrors QdrantRetriever's RetrievedChunk
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BM25Result:
    """A single BM25 search result with all metadata needed downstream."""

    chunk_id: str
    chunk_text: str
    score: float
    doc_id: str
    page_num: int | None = None


# ---------------------------------------------------------------------------
# Stored index structure — serialised to/from Redis
# ---------------------------------------------------------------------------

@dataclass
class BM25IndexData:
    """
    Everything we need to reconstruct a BM25Okapi instance.

    WHY store the raw corpus + metadata separately?
    BM25Okapi is not natively serialisable. We store the tokenised corpus,
    chunk IDs, texts, and metadata so we can rebuild the BM25Okapi object
    on-the-fly from the JSON stored in Redis.
    """

    tokenized_corpus: list[list[str]] = field(default_factory=list)
    chunk_ids: list[str] = field(default_factory=list)
    chunk_texts: list[str] = field(default_factory=list)
    doc_ids: list[str] = field(default_factory=list)
    page_nums: list[int | None] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(
            {
                "tokenized_corpus": self.tokenized_corpus,
                "chunk_ids": self.chunk_ids,
                "chunk_texts": self.chunk_texts,
                "doc_ids": self.doc_ids,
                "page_nums": self.page_nums,
            }
        )

    @classmethod
    def from_json(cls, raw: str) -> "BM25IndexData":
        data = json.loads(raw)
        return cls(
            tokenized_corpus=data["tokenized_corpus"],
            chunk_ids=data["chunk_ids"],
            chunk_texts=data["chunk_texts"],
            doc_ids=data["doc_ids"],
            page_nums=data["page_nums"],
        )


# ---------------------------------------------------------------------------
# BM25 Retriever
# ---------------------------------------------------------------------------

class BM25Retriever:
    """
    Keyword search using BM25Okapi with index persistence in Redis.

    Lifecycle:
      1. On document upload → rebuild_index(workspace_id) is called.
         This pulls every chunk for that workspace from Postgres,
         tokenises them, builds a BM25Okapi index, and stores the
         serialised index in Redis.

      2. On query → search(query, workspace_id) loads the index from Redis,
         reconstructs BM25Okapi, scores the query, and returns top-K results.

    WHY Redis for storage?
      • Fast reads (~1 ms) so search latency is not affected.
      • Shared across multiple uvicorn workers / containers.
      • TTL or eviction policies can be applied if memory is a concern.
    """

    # Redis key pattern for the BM25 index
    _KEY_TEMPLATE = "bm25:{workspace_id}:index"

    def __init__(self, redis_client):
        """
        Args:
            redis_client: A redis.Redis (or redis.asyncio.Redis) instance.
                          Injected so the caller controls connection pooling.
        """
        self._redis = redis_client

    # ── Public API ──────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        workspace_id: str,
        top_k: int = 20,
    ) -> list[BM25Result]:
        """
        Search the BM25 index for a workspace.

        Steps:
          1. Load serialised index from Redis (fast — it's in-memory).
          2. Rebuild BM25Okapi from the stored tokenised corpus.
          3. Tokenise the query with the SAME pipeline used at index time.
             WHY same pipeline?  If we stemmed during indexing but not at
             query time, "running" in the query wouldn't match "run" in
             the index — destroying recall.
          4. Score every document, pick top-K.

        Returns empty list if no index exists yet (first query before any upload).
        """
        key = self._KEY_TEMPLATE.format(workspace_id=workspace_id)

        raw = await self._redis_get(key)
        if raw is None:
            logger.warning("No BM25 index found for workspace %s", workspace_id)
            return []

        index_data = BM25IndexData.from_json(raw)
        if not index_data.tokenized_corpus:
            return []

        # Reconstruct the BM25 model from the stored tokenised documents
        bm25 = BM25Okapi(index_data.tokenized_corpus)

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        # get_scores returns an array of scores for EVERY doc in the corpus
        scores = bm25.get_scores(query_tokens)

        # Build (index, score) pairs and sort descending
        scored = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)

        results: list[BM25Result] = []
        for idx, score in scored[:top_k]:
            if score <= 0:
                # WHY skip zero-score?  BM25 assigns 0 to docs with no query
                # term overlap — they add noise and waste context budget.
                break
            results.append(
                BM25Result(
                    chunk_id=index_data.chunk_ids[idx],
                    chunk_text=index_data.chunk_texts[idx],
                    score=float(score),
                    doc_id=index_data.doc_ids[idx],
                    page_num=index_data.page_nums[idx],
                )
            )

        logger.info(
            "BM25 search for workspace %s returned %d results (query: %.50s…)",
            workspace_id,
            len(results),
            query,
        )
        return results

    async def rebuild_index(
        self,
        workspace_id: str,
        chunks: list[dict] | None = None,
    ) -> int:
        """
        Rebuild the BM25 index from scratch for a workspace.

        Args:
            workspace_id: The workspace whose index to rebuild.
            chunks: Optional list of dicts, each with keys:
                      chunk_id, text, doc_id, page_num (optional)

                    In production, the caller (routes.py or a background task)
                    pulls these from Postgres.  We accept them as a parameter
                    so this module stays decoupled from the database layer.

        Returns:
            Number of chunks indexed.

        WHY rebuild from scratch instead of incremental updates?
          BM25's IDF (inverse document frequency) component depends on the
          TOTAL number of documents.  Adding a single document changes IDF
          for every term.  A full rebuild guarantees correct scores.
          For most workspaces (< 100k chunks) this takes < 1 second.
        """
        if chunks is None:
            chunks = await self._load_chunks_from_postgres(workspace_id)

        index_data = BM25IndexData()

        for chunk in chunks:
            text = chunk.get("text", "")
            tokens = tokenize(text)
            if not tokens:
                # WHY skip empty?  An empty document in BM25 adds corpus size
                # without contributing terms, diluting IDF scores for all other docs.
                continue

            index_data.tokenized_corpus.append(tokens)
            index_data.chunk_ids.append(chunk["chunk_id"])
            index_data.chunk_texts.append(text)
            index_data.doc_ids.append(chunk.get("doc_id", ""))
            index_data.page_nums.append(chunk.get("page_num"))

        key = self._KEY_TEMPLATE.format(workspace_id=workspace_id)
        await self._redis_set(key, index_data.to_json())

        logger.info(
            "Rebuilt BM25 index for workspace %s: %d chunks indexed",
            workspace_id,
            len(index_data.chunk_ids),
        )
        return len(index_data.chunk_ids)

    async def _load_chunks_from_postgres(self, workspace_id: str) -> list[dict]:
        """Load chunks for a workspace from Postgres for full index rebuild."""
        dsn = os.environ.get("POSTGRES_DSN")
        if not dsn:
            logger.warning("POSTGRES_DSN missing; cannot rebuild BM25 from Postgres")
            return []

        try:
            import asyncpg
        except ImportError:
            logger.warning("asyncpg missing; cannot rebuild BM25 from Postgres")
            return []

        conn = await asyncpg.connect(dsn)
        try:
            rows = await conn.fetch(
                """
                SELECT dc.id::text AS chunk_id,
                       dc.text AS text,
                       dc.document_id::text AS doc_id,
                       dc.page_num AS page_num
                FROM document_chunks dc
                WHERE dc.workspace_id = $1
                """,
                workspace_id,
            )
            return [dict(row) for row in rows]
        finally:
            await conn.close()

    async def delete_index(self, workspace_id: str) -> None:
        """Remove the BM25 index for a workspace (e.g. on workspace deletion)."""
        key = self._KEY_TEMPLATE.format(workspace_id=workspace_id)
        await self._redis_delete(key)
        logger.info("Deleted BM25 index for workspace %s", workspace_id)

    # ── Redis helpers (async-compatible) ────────────────────────────────
    # WHY wrap Redis calls?  The redis-py library's async client uses
    # coroutines, but the sync client doesn't.  These wrappers let us
    # support both by duck-typing on the client passed in.

    async def _redis_get(self, key: str) -> str | None:
        """Get a value from Redis, handling both sync and async clients."""
        result = self._redis.get(key)
        # If the client is async, result is a coroutine — await it
        if hasattr(result, "__await__"):
            result = await result
        if result is None:
            return None
        return result if isinstance(result, str) else result.decode("utf-8")

    async def _redis_set(self, key: str, value: str) -> None:
        """Set a value in Redis, handling both sync and async clients."""
        result = self._redis.set(key, value)
        if hasattr(result, "__await__"):
            await result

    async def _redis_delete(self, key: str) -> None:
        """Delete a key from Redis, handling both sync and async clients."""
        result = self._redis.delete(key)
        if hasattr(result, "__await__"):
            await result
