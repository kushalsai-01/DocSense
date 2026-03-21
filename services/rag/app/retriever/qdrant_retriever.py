"""
Qdrant Vector Retriever — Dense (semantic) search layer.

WHY vector search?
──────────────────
Vector search converts text into high-dimensional embeddings where
semantically similar texts are *close together*.  This means a query
about "automobile" will find documents about "cars" even though
the exact word doesn't appear.  This is the core strength that BM25 lacks.

UPGRADE NOTES (from original):
  • top_k default raised from 5 → 20 to feed more candidates into
    the hybrid fusion stage (see hybrid_retriever.py).
  • Full metadata (doc_name, page_num, section_title, char_start,
    char_end) is now extracted from Qdrant payloads — needed downstream
    for citation highlighting in the frontend.
  • New filter_by_doc_ids parameter enables multi-document reasoning:
    the agent layer can restrict search to a subset of documents when
    the user references specific files.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from qdrant_client.http import models as qm

from app.core.settings import settings
from app.infra.qdrant.client import get_qdrant_client


@dataclass(frozen=True)
class RetrievedChunk:
    """
    A single vector search result with full metadata.

    WHY all these fields?
      • chunk_id / score / text — core retrieval data
      • doc_id / doc_name — needed to group results by document in the UI
      • page_num — powers "jump to page" in the document viewer
      • section_title — provides context in citation cards
      • char_start / char_end — enables precise text highlighting
        in the original document (the frontend maps these offsets
        back to the PDF/docx renderer)
      • chunk_index — preserves ordering within a document so we
        can reconstruct sequential context if needed
    """

    id: str
    score: float
    document_id: str | None
    text: str | None
    chunk_index: int | None = None
    # ── Extended metadata (new) ─────────────────────────────────
    doc_name: str | None = None
    page_num: int | None = None
    section_title: str | None = None
    char_start: int | None = None
    char_end: int | None = None


class EmbedderInterface:
    """Protocol that any embedder must implement to work with this retriever."""

    def embed_text(self, text: str) -> list[float]:
        raise NotImplementedError

    @property
    def vector_size(self) -> int:
        raise NotImplementedError


class QdrantRetriever:
    """
    Dense retrieval using Qdrant vector database.

    This is one of two retrieval backends in the hybrid pipeline.
    The other is BM25Retriever (keyword-based).
    Results from both are fused in hybrid_retriever.py using
    Reciprocal Rank Fusion (RRF).
    """

    def __init__(self, embedder: EmbedderInterface):
        self._client = get_qdrant_client()
        self._embedder = embedder

    def query(
        self,
        query_text: str,
        top_k: int = 20,
        workspace_id: str | None = None,
        filter_by_doc_ids: Optional[list[str]] = None,
    ) -> list[RetrievedChunk]:
        """
        Search for semantically similar chunks.

        Args:
            query_text: The user's question / search query.
            top_k: Number of results to return (default raised to 20
                   because the hybrid pipeline needs more candidates
                   to fuse with BM25 results before reranking picks
                   the final top 5).
            filter_by_doc_ids: Optional list of document IDs to restrict
                               search to.  WHY this exists: when a user
                               says "compare chapter 3 of report A with
                               report B", the agent layer passes only
                               those doc IDs here so irrelevant documents
                               don't pollute the results.

        Returns:
            List of RetrievedChunk with full metadata.
        """
        vector = self._embedder.embed_text(query_text)

        # ── Build Qdrant filter (only when doc_ids are specified) ──
        search_filter = None
        must_conditions = []
        if workspace_id:
            must_conditions.append(
                qm.FieldCondition(
                    key="workspace_id",
                    match=qm.MatchValue(value=workspace_id),
                )
            )
        if filter_by_doc_ids:
            # WHY MatchAny?  We want chunks from ANY of the listed docs,
            # not chunks that belong to ALL of them (that would be MatchAll).
            must_conditions.append(
                qm.FieldCondition(
                    key="document_id",
                    match=qm.MatchAny(any=filter_by_doc_ids),
                )
            )
        if must_conditions:
            search_filter = qm.Filter(must=must_conditions)

        results = self._client.search(
            collection_name=settings.qdrant_collection,
            query_vector=vector,
            limit=top_k,
            with_payload=True,
            query_filter=search_filter,
        )

        out: list[RetrievedChunk] = []
        for p in results:
            payload = p.payload or {}
            chunk_index = payload.get("chunk_index")

            out.append(
                RetrievedChunk(
                    id=str(p.id),
                    score=float(p.score),
                    document_id=payload.get("document_id"),
                    text=payload.get("text"),
                    chunk_index=(
                        int(chunk_index) if chunk_index is not None else None
                    ),
                    # ── Extract extended metadata from Qdrant payload ──
                    # These fields are stored during the /embed endpoint.
                    # If a field is missing (e.g. old chunks ingested before
                    # this upgrade), we gracefully default to None.
                    doc_name=payload.get("doc_name"),
                    page_num=payload.get("page_num"),
                    section_title=payload.get("section_title"),
                    char_start=payload.get("char_start"),
                    char_end=payload.get("char_end"),
                )
            )

        return out

    def upsert_chunks(self, document_id: str, chunks: list[dict]) -> int:
        """
        Insert or update chunk embeddings in Qdrant.

        Args:
            document_id: The document these chunks belong to.
            chunks: List of (chunk_id, chunk_index, text) tuples.

        Returns:
            Number of points upserted.
        """
        if not chunks:
            return 0

        vectors = self._embedder.embed_texts([c["text"] for c in chunks])
        points: list[qm.PointStruct] = []

        for chunk, vector in zip(chunks, vectors, strict=True):
            chunk_id = chunk["chunk_id"]
            chunk_index = chunk["chunk_index"]
            text = chunk["text"]
            points.append(
                qm.PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload={
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "text": text,
                        "workspace_id": chunk.get("workspace_id"),
                        "doc_name": chunk.get("doc_name"),
                        "page_num": chunk.get("page_num"),
                        "section_title": chunk.get("section_title"),
                        "char_start": chunk.get("char_start"),
                        "char_end": chunk.get("char_end"),
                    },
                )
            )

        self._client.upsert(
            collection_name=settings.qdrant_collection, points=points
        )
        return len(points)

    def delete_by_document(self, document_id: str) -> int:
        """Delete all vectors belonging to a document."""
        self._client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(
                    must=[
                        qm.FieldCondition(
                            key="document_id",
                            match=qm.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
        )
        return 0
