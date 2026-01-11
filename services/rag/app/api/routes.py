from __future__ import annotations

from fastapi import APIRouter

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
    embedder = get_embedder()
    retriever = QdrantRetriever(embedder)

    upserted = retriever.upsert_chunks(
        document_id=req.document_id,
        chunks=[(c.chunk_id, c.chunk_index, c.text) for c in req.chunks],
    )

    return EmbedResponse(upserted=upserted)


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
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
