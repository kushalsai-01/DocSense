from __future__ import annotations

from pydantic import BaseModel, Field


class ChunkIn(BaseModel):
    chunk_id: str = Field(..., min_length=1)
    chunk_index: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)


class EmbedRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    chunks: list[ChunkIn]


class EmbedResponse(BaseModel):
    upserted: int


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=50)


class RetrievedChunkOut(BaseModel):
    id: str
    score: float
    document_id: str | None
    text: str | None


class QueryResponse(BaseModel):
    answer: str
    matches: list[RetrievedChunkOut]
