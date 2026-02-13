from __future__ import annotations
from pydantic import BaseModel, Field
class AgentQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="User question")
    session_id: str | None = Field(None, description="Session ID for conversation persistence")
    user_id: str | None = Field(None, description="User ID for scoping")
    top_k: int = Field(5, ge=1, le=50, description="Max retrieval results per search")
    enable_planning: bool = Field(True, description="Enable agent planning (vs direct search)")
    enable_evaluation: bool = Field(True, description="Enable self-evaluation")
    include_trace: bool = Field(False, description="Include agent reasoning trace in response")
    include_suggestions: bool = Field(True, description="Include follow-up suggestions")
class ConversationRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    user_id: str | None = None
class Citation(BaseModel):
    chunk_id: str
    document_id: str | None = None
    chunk_index: int | None = None
    text_snippet: str | None = None
class AgentStepOut(BaseModel):
    step: int
    phase: str
    content: str
    tool: str | None = None
    duration_ms: int = 0
class AgentQueryResponse(BaseModel):
    answer: str
    citations: list[Citation] = []
    suggestions: list[str] = []
    strategy: str | None = None
    agent_trace: list[AgentStepOut] = Field(default_factory=list, description="Reasoning steps (if requested)")
    conversation_summary: dict | None = None
    total_duration_ms: int = 0
    status: str = "completed"
    matches: list[dict] = Field(default_factory=list)
class ConversationSummary(BaseModel):
    session_id: str
    total_messages: int = 0
    user_messages: int = 0
    assistant_messages: int = 0
    started_at: str | None = None
    last_activity: str | None = None
class HealthResponse(BaseModel):
    status: str
    service: str = "agent"
    llm_available: bool = False
    rag_reachable: bool = False
    db_connected: bool = False
