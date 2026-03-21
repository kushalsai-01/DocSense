"""
API Schemas — Pydantic models for request/response validation.

UPGRADE NOTES:
  • EmbedRequest now accepts workspace_id (needed for BM25 index keying).
  • ChunkIn now accepts optional metadata fields (doc_name, page_num, etc.)
    for richer indexing.
  • QueryRequest now accepts workspace_id and filter_by_doc_ids for the
    hybrid retrieval pipeline.
  • RetrievedChunkOut includes all extended metadata fields.
  • Citation includes page_num, char_start, char_end for highlight support.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChunkIn(BaseModel):
    """A single chunk to be embedded and indexed."""

    chunk_id: str = Field(..., min_length=1)
    chunk_index: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)
    # ── Optional metadata (new) — stored in Qdrant payload ─────
    doc_name: str | None = None
    page_num: int | None = None
    section_title: str | None = None
    char_start: int | None = None
    char_end: int | None = None


class EmbedRequest(BaseModel):
    """Request to embed and index document chunks."""

    document_id: str = Field(..., min_length=1)
    chunks: list[ChunkIn]
    # WHY workspace_id?  BM25 indexes are scoped per-workspace.
    # After upserting vectors into Qdrant, we also rebuild the BM25
    # index for this workspace so keyword search stays in sync.
    workspace_id: str | None = Field(
        None, description="Workspace ID for BM25 index rebuild"
    )


class EmbedResponse(BaseModel):
    upserted: int
    bm25_indexed: int = Field(
        0, description="Number of chunks indexed in BM25"
    )


class QueryRequest(BaseModel):
    """Request to query the RAG pipeline."""

    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=50)
    session_id: str | None = Field(
        None, description="Session ID for conversation memory"
    )
    use_decomposition: bool = Field(
        False, description="Use query decomposition for complex questions"
    )
    include_suggestions: bool = Field(
        True, description="Include follow-up question suggestions"
    )
    # ── New fields for hybrid retrieval ─────────────────────────
    workspace_id: str | None = Field(
        None,
        description="Workspace ID — required for hybrid (BM25+vector) search",
    )
    filter_by_doc_ids: list[str] | None = Field(
        None,
        description="Restrict search to specific documents (for multi-doc reasoning)",
    )


class RetrievedChunkOut(BaseModel):
    """A retrieved chunk in the API response with full metadata."""

    id: str
    score: float
    document_id: str | None
    text: str | None
    # ── Extended metadata (new) ─────────────────────────────────
    doc_name: str | None = None
    page_num: int | None = None
    section_title: str | None = None
    char_start: int | None = None
    char_end: int | None = None


class Citation(BaseModel):
    """Citation reference for an answer — used by frontend for highlighting."""

    chunk_id: str
    document_id: str | None
    chunk_index: int | None = None
    text_snippet: str | None = None
    # ── New fields for citation highlighting ────────────────────
    page_num: int | None = None
    char_start: int | None = None
    char_end: int | None = None


class SubQueryResult(BaseModel):
    question: str
    answer: str
    priority: int
    citations: list[Citation] = []


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation] = []
    matches: list[RetrievedChunkOut]
    suggestions: list[str] = Field(
        default_factory=list, description="Suggested follow-up questions"
    )
    sub_queries: list[SubQueryResult] = Field(
        default_factory=list,
        description="Decomposed sub-queries if used",
    )
    agent_trace: list[str] = Field(
        default_factory=list,
        description="Agent reasoning steps for debugging",
    )
    conversation_summary: dict | None = Field(
        None, description="Conversation statistics if session is used"
    )
    retrieval_method: str = Field(
        "hybrid",
        description="Which retrieval method was used (hybrid, vector_only, bm25_only)",
    )


# ═══════════════════════════════════════════════════════════════════════
# RAW CHUNK RETRIEVAL (used by Agent service's LangGraph pipeline)
# ═══════════════════════════════════════════════════════════════════════
# WHY a separate endpoint from /query?
# The /query endpoint runs the FULL pipeline (retrieve → budget → generate).
# But the LangGraph agent needs RAW chunks so it can:
#   • Grade relevance itself (node 3)
#   • Generate with its own prompts (node 4)
#   • Check hallucinations (node 5)
# Separating "get chunks" from "get answer" gives the agent full control.
# ═══════════════════════════════════════════════════════════════════════


class QueryChunksRequest(BaseModel):
    """Request raw chunks from the hybrid retriever (no LLM generation)."""

    query: str = Field(..., min_length=1)
    workspace_id: str | None = Field(
        None, description="Workspace ID for hybrid retrieval"
    )
    top_k: int = Field(10, ge=1, le=50)
    filter_by_doc_ids: list[str] | None = Field(
        None, description="Restrict to specific documents"
    )


class ChunkOut(BaseModel):
    """A single retrieved chunk with full metadata."""

    chunk_id: str
    chunk_text: str
    score: float
    doc_id: str | None = None
    doc_name: str | None = None
    page_num: int | None = None
    section_title: str | None = None
    char_start: int | None = None
    char_end: int | None = None
    chunk_index: int | None = None


class QueryChunksResponse(BaseModel):
    """Response containing raw retrieved chunks."""

    chunks: list[ChunkOut]
    retrieval_method: str = "hybrid"
    total_candidates: int = Field(
        0, description="Total chunks before final selection"
    )
