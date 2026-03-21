"""
Agent API Routes — FastAPI endpoints for the Agent service.

Endpoints:
  POST /agent/query            — full LangGraph pipeline (blocking)
  POST /agent/query/stream     — SSE streaming version
  POST /agent/documents/process — document intelligence enrichment
  GET  /agent/conversations/:session_id
  DELETE /agent/conversations/:session_id
  GET  /agent/conversations/:session_id/actions
  GET  /agent/health
"""

from __future__ import annotations

import asyncio
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
    DocumentProcessRequest,
)
from app.agent.graph import build_graph, AgentState
from app.agent.memory import ConversationMemory, ActionLogger
from app.agent.router import LLMRouter
from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.intelligence.document_processor import DocumentIntelligenceProcessor

logger = get_logger(__name__)
router = APIRouter()

_graph = build_graph()
_llm_router: LLMRouter | None = None
_doc_processor: DocumentIntelligenceProcessor | None = None


def get_llm_router() -> LLMRouter:
    global _llm_router
    if _llm_router is None:
        _llm_router = LLMRouter()
    return _llm_router


def get_doc_processor() -> DocumentIntelligenceProcessor:
    global _doc_processor
    if _doc_processor is None:
        _doc_processor = DocumentIntelligenceProcessor()
    return _doc_processor


# ═══════════════════════════════════════════════════════════════════════
# QUERY — blocking
# ═══════════════════════════════════════════════════════════════════════


@router.post("/query", response_model=AgentQueryResponse)
async def agent_query(
    req: AgentQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    logger.info("agent_query_received", query=req.query[:100], session_id=req.session_id)

    conversation_id = None
    conversation_summary = None

    if req.session_id:
        memory = ConversationMemory(db)
        conv = await memory.get_or_create_conversation(req.session_id, req.user_id)
        conversation_id = conv["id"]
        await memory.add_message(conversation_id, "user", req.query)

    initial_state: AgentState = {
        "query": req.query,
        "workspace_id": req.workspace_id or "",
        "session_id": req.session_id or "",
        "retry_count": 0,
    }

    try:
        result_state = await _graph.ainvoke(initial_state)
    except Exception as exc:
        logger.error("agent_graph_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {exc}") from exc

    answer = result_state.get("answer", "I couldn't process your query.")
    citations_raw = result_state.get("citations", [])
    suggestions = result_state.get("suggestions", [])
    query_type = result_state.get("query_type", "factual")

    citation_schemas = [
        Citation(
            chunk_id=c.get("chunk_id", ""),
            document_id=c.get("doc_id"),
            chunk_index=c.get("chunk_index"),
            text_snippet=c.get("text_snippet"),
            page_num=c.get("page_num"),
            char_start=c.get("char_start"),
            char_end=c.get("char_end"),
        )
        for c in citations_raw
    ]

    if conversation_id:
        memory = ConversationMemory(db)
        await memory.add_message(
            conversation_id, "assistant", answer,
            citations=[c.dict() for c in citation_schemas],
        )
        if settings.enable_trace_logging:
            action_logger = ActionLogger(db)
            await action_logger.log_action(
                conversation_id=conversation_id,
                action_type="langgraph_execution",
                tool_name="graph",
                input_data={"query": req.query, "query_type": query_type},
                output_data={
                    "answer_length": len(answer),
                    "citation_count": len(citation_schemas),
                    "hallucination_safe": result_state.get("hallucination_safe", False),
                    "retry_count": result_state.get("retry_count", 0),
                },
                success=True,
            )
        conversation_summary = await memory.get_conversation_summary(conversation_id)

    trace = []
    if req.include_trace:
        trace = [
            AgentStepOut(step=1, phase="analyze", content=f"Query type: {query_type}, sub-queries: {result_state.get('sub_queries', [])}", duration_ms=0),
            AgentStepOut(step=2, phase="retrieve", content=f"Retrieved {len(result_state.get('retrieved_chunks', []))} chunks", duration_ms=0),
            AgentStepOut(step=3, phase="grade", content=f"Graded: {len(result_state.get('graded_chunks', []))} relevant (retries: {result_state.get('retry_count', 0)})", duration_ms=0),
            AgentStepOut(step=4, phase="generate", content=f"Generated {len(answer)} chars, {len(citation_schemas)} citations", duration_ms=0),
            AgentStepOut(step=5, phase="verify", content=f"Hallucination check: {'PASSED' if result_state.get('hallucination_safe') else 'CORRECTED'}", duration_ms=0),
        ]

    return AgentQueryResponse(
        answer=answer,
        citations=citation_schemas,
        suggestions=suggestions if req.include_suggestions else [],
        strategy=query_type,
        agent_trace=trace,
        conversation_summary=conversation_summary,
        total_duration_ms=0,
        status="completed" if not result_state.get("error") else "failed",
    )


# ═══════════════════════════════════════════════════════════════════════
# QUERY/STREAM — SSE streaming
# ═══════════════════════════════════════════════════════════════════════


@router.post("/query/stream")
async def agent_query_stream(req: AgentQueryRequest):
    """
    Stream the agent pipeline as Server-Sent Events.

    Events emitted in order:
      plan        → {strategy, sub_queries}
      thinking    → {content}        (per grading/generation thought)
      tool_call   → {tool, input}
      tool_result → {tool, result}
      answer_chunk → {content}       (streamed tokens)
      answer_complete → {answer, citations, quality_score, suggestions}
      done        → {status}
    """

    async def event_generator():
        try:
            llm = get_llm_router()

            # ── Phase 1: Query analysis ──────────────────────────────
            yield _sse("thinking", {"content": "Analyzing query structure..."})

            initial_state: AgentState = {
                "query": req.query,
                "workspace_id": req.workspace_id or "",
                "session_id": req.session_id or "",
                "retry_count": 0,
            }

            # Run query_analyzer node
            from app.agent.graph import query_analyzer_node
            analyzer_result = await query_analyzer_node(initial_state)
            initial_state.update(analyzer_result)  # type: ignore[arg-type]

            query_type = analyzer_result.get("query_type", "factual")
            sub_queries = analyzer_result.get("sub_queries", [req.query])

            yield _sse("plan", {
                "strategy": query_type,
                "steps": sub_queries,
                "sub_queries": sub_queries,
            })

            # ── Phase 2: Retrieval ───────────────────────────────────
            yield _sse("thinking", {"content": f"Searching documents for {len(sub_queries)} sub-queries..."})
            yield _sse("tool_call", {"tool": "hybrid_search", "input": {"queries": sub_queries}})

            from app.agent.graph import retriever_node
            retriever_result = await retriever_node(initial_state)
            initial_state.update(retriever_result)  # type: ignore[arg-type]

            chunk_count = len(retriever_result.get("retrieved_chunks", []))
            yield _sse("tool_result", {"tool": "hybrid_search", "result": f"Found {chunk_count} candidate chunks"})

            # ── Phase 3: Relevance grading ───────────────────────────
            yield _sse("thinking", {"content": f"Grading relevance of {chunk_count} chunks..."})

            from app.agent.graph import relevance_grader_node
            grader_result = await relevance_grader_node(initial_state)
            initial_state.update(grader_result)  # type: ignore[arg-type]

            graded_count = len(grader_result.get("graded_chunks", []))
            yield _sse("thinking", {"content": f"Kept {graded_count} relevant chunks after grading"})

            # ── Phase 4: Generation (stream answer chunks) ───────────
            yield _sse("thinking", {"content": "Generating answer with citations..."})

            from app.agent.graph import generator_node
            gen_result = await generator_node(initial_state)
            initial_state.update(gen_result)  # type: ignore[arg-type]

            # Stream the answer word-by-word for realistic streaming effect
            answer = gen_result.get("answer", "")
            words = answer.split()
            chunk_size = 3  # emit 3 words at a time

            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i:i + chunk_size]) + " "
                yield _sse("answer_chunk", {"content": chunk})
                await asyncio.sleep(0.02)  # ~50 tokens/second

            # ── Phase 5: Hallucination check ─────────────────────────
            yield _sse("thinking", {"content": "Verifying answer groundedness..."})

            from app.agent.graph import hallucination_checker_node
            checker_result = await hallucination_checker_node(initial_state)
            initial_state.update(checker_result)  # type: ignore[arg-type]

            final_answer = initial_state.get("answer", answer)
            citations_raw = initial_state.get("citations", [])
            suggestions = initial_state.get("suggestions", [])

            hallucination_safe = checker_result.get("hallucination_safe", True)
            if not hallucination_safe:
                yield _sse("thinking", {"content": "Corrected unsupported claims in answer"})

            # ── Final answer event ───────────────────────────────────
            yield _sse("answer_complete", {
                "answer": final_answer,
                "citations": citations_raw,
                "quality_score": 0.90 if hallucination_safe else 0.75,
                "suggestions": suggestions[:3],
                "strategy": query_type,
            })

            yield _sse("done", {"status": "complete"})

        except Exception as exc:
            logger.error("stream_query_failed", error=str(exc))
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ═══════════════════════════════════════════════════════════════════════
# DOCUMENT INTELLIGENCE
# ═══════════════════════════════════════════════════════════════════════


@router.post("/documents/process")
async def process_document(req: DocumentProcessRequest):
    """
    Enrich a document with AI-generated metadata.
    Called asynchronously by the Node.js API after upload.
    Runs in background — returns immediately.
    """
    processor = get_doc_processor()
    asyncio.create_task(
        processor.process(req.document_id, req.full_text, req.chunks)
    )
    return {"status": "processing", "document_id": req.document_id}


# ═══════════════════════════════════════════════════════════════════════
# CONVERSATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════


@router.get("/conversations/{session_id}", response_model=ConversationSummary)
async def get_conversation(session_id: str, db: AsyncSession = Depends(get_db)):
    memory = ConversationMemory(db)
    conv = await memory.get_or_create_conversation(session_id)
    summary = await memory.get_conversation_summary(conv["id"])
    return ConversationSummary(session_id=session_id, **summary)


@router.delete("/conversations/{session_id}")
async def delete_conversation(session_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM conversations WHERE session_id = :sid"), {"sid": session_id})
    return {"deleted": True, "session_id": session_id}


@router.get("/conversations/{session_id}/actions")
async def get_conversation_actions(session_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    memory = ConversationMemory(db)
    conv = await memory.get_or_create_conversation(session_id)
    action_logger = ActionLogger(db)
    actions = await action_logger.get_actions(conv["id"], limit=limit)
    return {"session_id": session_id, "actions": actions}


# ═══════════════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════════════


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
