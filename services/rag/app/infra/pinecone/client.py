"""
Pinecone vector backend — alternative to Qdrant.

Activated when VECTOR_BACKEND=pinecone and PINECONE_API_KEY is set.
Provides the same interface as QdrantRetriever so the RAG pipeline
can swap backends without changing application logic.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PineconeResult:
    id: str
    score: float
    document_id: str
    text: str
    chunk_index: int
    doc_name: Optional[str] = None
    page_num: Optional[int] = None
    section_title: Optional[str] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None


class PineconeRetriever:
    """
    Pinecone-backed dense vector retriever.

    Requires:
      pip install pinecone-client
      PINECONE_API_KEY env var
      PINECONE_INDEX env var
    """

    def __init__(
        self,
        embedder,
        api_key: Optional[str] = None,
        index_name: Optional[str] = None,
        environment: Optional[str] = None,
    ) -> None:
        from app.core.settings import settings

        self._embedder = embedder
        self._api_key = api_key or settings.pinecone_api_key
        self._index_name = index_name or settings.pinecone_index
        self._environment = environment or settings.pinecone_environment
        self._index = None
        self._available: Optional[bool] = None

    def _get_index(self):
        if self._index is not None:
            return self._index
        try:
            from pinecone import Pinecone
            pc = Pinecone(api_key=self._api_key)
            self._index = pc.Index(self._index_name)
            self._available = True
            logger.info("pinecone_connected", index=self._index_name)
            return self._index
        except ImportError:
            logger.warning("pinecone-client not installed. pip install pinecone-client")
            self._available = False
            return None
        except Exception as exc:
            logger.error("pinecone_connection_failed: %s", exc)
            self._available = False
            return None

    def upsert_chunks(self, document_id: str, chunks: list[dict]) -> int:
        index = self._get_index()
        if index is None:
            return 0

        vectors = []
        for chunk in chunks:
            text = chunk.get("text", "")
            embedding = self._embedder.embed(text)
            vectors.append({
                "id": chunk.get("chunk_id", f"{document_id}_{chunk.get('chunk_index', 0)}"),
                "values": embedding,
                "metadata": {
                    "document_id": document_id,
                    "text": text[:1000],
                    "chunk_index": chunk.get("chunk_index", 0),
                    "workspace_id": chunk.get("workspace_id", ""),
                    "doc_name": chunk.get("doc_name", ""),
                    "page_num": chunk.get("page_num"),
                    "char_start": chunk.get("char_start"),
                    "char_end": chunk.get("char_end"),
                },
            })

        batch_size = 100
        upserted = 0
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            index.upsert(vectors=batch)
            upserted += len(batch)

        logger.info("pinecone_upserted", document_id=document_id, count=upserted)
        return upserted

    def query(
        self,
        query_text: str,
        top_k: int = 10,
        workspace_id: Optional[str] = None,
        filter_by_doc_ids: Optional[list[str]] = None,
    ) -> list[PineconeResult]:
        index = self._get_index()
        if index is None:
            return []

        query_vector = self._embedder.embed(query_text)
        filter_dict: dict = {}
        if workspace_id:
            filter_dict["workspace_id"] = {"$eq": workspace_id}
        if filter_by_doc_ids:
            filter_dict["document_id"] = {"$in": filter_by_doc_ids}

        response = index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict if filter_dict else None,
        )

        results = []
        for match in response.matches:
            meta = match.metadata or {}
            results.append(PineconeResult(
                id=match.id,
                score=float(match.score),
                document_id=meta.get("document_id", ""),
                text=meta.get("text", ""),
                chunk_index=int(meta.get("chunk_index", 0)),
                doc_name=meta.get("doc_name"),
                page_num=meta.get("page_num"),
                char_start=meta.get("char_start"),
                char_end=meta.get("char_end"),
            ))

        return results

    def delete_by_document(self, document_id: str) -> int:
        index = self._get_index()
        if index is None:
            return 0
        results = index.query(
            vector=[0.0] * 384,
            top_k=1000,
            filter={"document_id": {"$eq": document_id}},
            include_values=False,
        )
        ids = [m.id for m in results.matches]
        if ids:
            index.delete(ids=ids)
        return len(ids)

    @property
    def is_available(self) -> bool:
        if self._available is None:
            self._get_index()
        return self._available or False
