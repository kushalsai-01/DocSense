from __future__ import annotations

from dataclasses import dataclass

from qdrant_client.http import models as qm

from app.core.settings import settings
from app.embeddings.embedder import PlaceholderEmbedder
from app.infra.qdrant.client import get_qdrant_client


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    score: float
    document_id: str | None
    text: str | None


class QdrantRetriever:
    def __init__(self, embedder: PlaceholderEmbedder):
        self._client = get_qdrant_client()
        self._embedder = embedder

    def query(self, query_text: str, top_k: int) -> list[RetrievedChunk]:
        vector = self._embedder.embed_text(query_text)

        results = self._client.search(
            collection_name=settings.qdrant_collection,
            query_vector=vector,
            limit=top_k,
            with_payload=True,
        )

        out: list[RetrievedChunk] = []
        for p in results:
            payload = p.payload or {}
            out.append(
                RetrievedChunk(
                    id=str(p.id),
                    score=float(p.score),
                    document_id=payload.get("document_id"),
                    text=payload.get("text"),
                )
            )
        return out

    def upsert_chunks(self, document_id: str, chunks: list[tuple[str, int, str]]) -> int:
        """Upsert chunk points into Qdrant.

        chunks: list of (chunk_id, chunk_index, text)
        """
        if not chunks:
            return 0

        vectors = self._embedder.embed_texts([c[2] for c in chunks])

        points: list[qm.PointStruct] = []
        for (chunk_id, chunk_index, text), vector in zip(chunks, vectors, strict=True):
            points.append(
                qm.PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload={
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "text": text,
                    },
                )
            )

        self._client.upsert(collection_name=settings.qdrant_collection, points=points)
        return len(points)
