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
    session_id: str | None = Field(None, description="Session ID for conversation memory")
    use_decomposition: bool = Field(False, description="Use query decomposition for complex questions")
    include_suggestions: bool = Field(True, description="Include follow-up question suggestions")


class RetrievedChunkOut(BaseModel):
    id: str
    score: float
    document_id: str | None
    text: str | None


class Citation(BaseModel):
    chunk_id: str
    document_id: str | None
    chunk_index: int | None
    text_snippet: str | None


class SubQueryResult(BaseModel):
    """Result from a decomposed sub-query."""
    question: str
    answer: str
    priority: int
    citations: list[Citation] = []


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation] = []
    matches: list[RetrievedChunkOut]
    suggestions: list[str] = Field(default_factory=list, description="Suggested follow-up questions")
    sub_queries: list[SubQueryResult] = Field(default_factory=list, description="Decomposed sub-queries if used")
    agent_trace: list[str] = Field(default_factory=list, description="Agent reasoning steps for debugging")
    conversation_summary: dict | None = Field(None, description="Conversation statistics if session is used")
