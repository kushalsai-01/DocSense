from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import (
    EmbedRequest,
    EmbedResponse,
    QueryRequest,
    QueryResponse,
    RetrievedChunkOut,
)
from app.core.settings import settings
from app.embeddings.embedder import PlaceholderEmbedder
from app.generator.placeholder_generator import PlaceholderGenerator
from app.retriever.qdrant_retriever import QdrantRetriever

router = APIRouter()


@router.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    embedder = PlaceholderEmbedder(vector_size=settings.qdrant_vector_size)
    retriever = QdrantRetriever(embedder)

    upserted = retriever.upsert_chunks(
        document_id=req.document_id,
        chunks=[(c.chunk_id, c.chunk_index, c.text) for c in req.chunks],
    )

    return EmbedResponse(upserted=upserted)


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    embedder = PlaceholderEmbedder(vector_size=settings.qdrant_vector_size)
    retriever = QdrantRetriever(embedder)
    generator = PlaceholderGenerator()

    matches = retriever.query(req.query, top_k=req.top_k)
    answer = generator.generate(req.query, matches)

    return QueryResponse(
        answer=answer.answer,
        matches=[
            RetrievedChunkOut(id=m.id, score=m.score, document_id=m.document_id, text=m.text) for m in matches
        ],
    )
