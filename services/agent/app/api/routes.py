from __future__ import annotations
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api.schemas import (
    AgentQueryRequest,
    AgentQueryResponse,
    AgentStepOut,
    Citation,
    ConversationRequest,
    ConversationSummary,
    HealthResponse,
)
from app.agent.executor import AgentExecutor
from app.agent.memory import ConversationMemory, ActionLogger
from app.agent.router import LLMRouter
from app.agent.tools import AgentTools
from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
logger = get_logger(__name__)
router = APIRouter()
_llm_router: LLMRouter | None = None
def get_llm_router() -> LLMRouter:
    global _llm_router
    if _llm_router is None:
        _llm_router = LLMRouter()
    return _llm_router
@router.post("/query", response_model=AgentQueryResponse)
async def agent_query(
    req: AgentQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    logger.info("agent_query_received", query=req.query[:100], session_id=req.session_id)
    llm = get_llm_router()
    tools = AgentTools()
    executor = AgentExecutor(llm_provider=llm, tools=tools)
    conversation_context = None
    conversation_id = None
    conversation_summary = None
    if req.session_id:
        memory = ConversationMemory(db)
        conv = await memory.get_or_create_conversation(req.session_id, req.user_id)
        conversation_id = conv["id"]
        conversation_context = await memory.get_context(conversation_id, last_n=5)
        await memory.add_message(conversation_id, "user", req.query)
    state = await executor.execute(
        query=req.query,
        conversation_context=conversation_context,
        session_id=req.session_id,
    )
    if conversation_id:
        memory = ConversationMemory(db)
        await memory.add_message(
            conversation_id,
            "assistant",
            state.final_answer,
            citations=state.citations,
        )
        if settings.enable_trace_logging:
            action_logger = ActionLogger(db)
            await action_logger.log_agent_trace(
                conversation_id=conversation_id,
                steps=[s.to_dict() for s in state.steps],
            )
        conversation_summary_data = await memory.get_conversation_summary(conversation_id)
        conversation_summary = conversation_summary_data
    trace = []
    if req.include_trace:
        trace = [
            AgentStepOut(
                step=s.step_number,
                phase=s.phase,
                content=s.content,
                tool=s.tool_name,
                duration_ms=s.duration_ms,
            )
            for s in state.steps
        ]
    return AgentQueryResponse(
        answer=state.final_answer,
        citations=[
            Citation(
                chunk_id=c.get("chunk_id", ""),
                document_id=c.get("document_id"),
                chunk_index=c.get("chunk_index"),
                text_snippet=c.get("text_snippet"),
            )
            for c in state.citations
        ],
        suggestions=state.suggestions if req.include_suggestions else [],
        strategy=state.plan.strategy if state.plan else None,
        agent_trace=trace,
        conversation_summary=conversation_summary,
        total_duration_ms=state.total_duration_ms,
        status=state.status,
    )
@router.get("/conversations/{session_id}", response_model=ConversationSummary)
async def get_conversation(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    memory = ConversationMemory(db)
    conv = await memory.get_or_create_conversation(session_id)
    summary = await memory.get_conversation_summary(conv["id"])
    return ConversationSummary(
        session_id=session_id,
        **summary,
    )
@router.delete("/conversations/{session_id}")
async def delete_conversation(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM conversations WHERE session_id = :sid"),
        {"sid": session_id},
    )
    return {"deleted": True, "session_id": session_id}
@router.get("/conversations/{session_id}/actions")
async def get_conversation_actions(
    session_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    memory = ConversationMemory(db)
    conv = await memory.get_or_create_conversation(session_id)
    action_logger = ActionLogger(db)
    actions = await action_logger.get_actions(conv["id"], limit=limit)
    return {"session_id": session_id, "actions": actions}
@router.get("/health", response_model=HealthResponse)
async def health():
    llm = get_llm_router()
    rag_ok = False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.rag_service_url}/health")
            rag_ok = resp.status_code == 200
    except Exception:
        pass
    db_ok = False
    try:
        from app.core.database import get_engine
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass
    status = "ok" if rag_ok and db_ok else "degraded"
    return HealthResponse(
        status=status,
        service="agent",
        llm_available=llm.is_available,
        rag_reachable=rag_ok,
        db_connected=db_ok,
    )
