from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.api.schemas import (
    Citation,
    EmbedRequest,
    EmbedResponse,
    QueryRequest,
    QueryResponse,
    RetrievedChunkOut,
)
from app.core.settings import settings
from app.embeddings.sentence_embedder import SentenceEmbedder
from app.generator.llm_generator import LLMGenerator
from app.retriever.qdrant_retriever import QdrantRetriever

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize embedder once (lazy-loaded)
_embedder: SentenceEmbedder | None = None


def get_embedder() -> SentenceEmbedder:
    """Get or create the embedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = SentenceEmbedder()
    return _embedder


@router.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)

        upserted = retriever.upsert_chunks(
            document_id=req.document_id,
            chunks=[(c.chunk_id, c.chunk_index, c.text) for c in req.chunks],
        )

        return EmbedResponse(upserted=upserted)
    except Exception as exc:
        logger.error("Embedding failed for document %s: %s", req.document_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}") from exc


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        generator = LLMGenerator()

        matches = retriever.query(req.query, top_k=req.top_k)
        answer = generator.generate(req.query, matches)

        # Convert citations to schema format
        citation_schemas = [
            Citation(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                text_snippet=c.text_snippet,
            )
            for c in answer.citations
        ]

        return QueryResponse(
            answer=answer.answer,
            citations=citation_schemas,
            matches=[
                RetrievedChunkOut(id=m.id, score=m.score, document_id=m.document_id, text=m.text) for m in matches
            ],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Query failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc


@router.delete("/documents/{document_id}/vectors")
def delete_document_vectors(document_id: str) -> dict[str, bool]:
    """Delete all Qdrant vectors associated with a document."""
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        deleted = retriever.delete_by_document(document_id)
        logger.info("Deleted %d vectors for document %s", deleted, document_id)
        return {"deleted": True}
    except Exception as exc:
        logger.error("Failed to delete vectors for document %s: %s", document_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
