"""
API Routes — FastAPI endpoints for the RAG service.

Endpoints:
  POST /embed              — store chunks in Qdrant + BM25
  POST /query              — full RAG pipeline (retrieve + generate)
  POST /query-chunks       — raw chunk retrieval (used by agent)
  POST /reindex/:ws        — manual BM25 rebuild
  DELETE /documents/:id/vectors — delete document vectors
  POST /eval               — RAGAS evaluation
  GET  /eval/summary       — average RAGAS scores (last 100 queries)
  POST /query-history      — store Q&A pair as vector
  GET  /similar-queries    — find semantically similar past queries
  GET  /health             — health check
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from qdrant_client.http import models as qm

from app.api.schemas import (
    ChunkOut,
    Citation,
    EmbedRequest,
    EmbedResponse,
    QueryChunksRequest,
    QueryChunksResponse,
    QueryRequest,
    QueryResponse,
    RetrievedChunkOut,
    SubQueryResult,
)
from app.core.settings import settings
from app.embeddings.sentence_embedder import SentenceEmbedder
from app.evaluation.ragas_eval import RAGEvaluator
from app.generator.llm_generator import LLMGenerator
from app.retriever.qdrant_retriever import QdrantRetriever, RetrievedChunk
from app.retriever.bm25_retriever import BM25Retriever
from app.retriever.hybrid_retriever import HybridRetriever
from app.agent.memory import ConversationManager
from app.agent.decomposer import QueryDecomposer
from app.agent.suggestions import SuggestionEngine
from app.infra.qdrant import query_history as qh

logger = logging.getLogger(__name__)
router = APIRouter()

_embedder: SentenceEmbedder | None = None
_conversation_manager: ConversationManager | None = None
_redis_client: aioredis.Redis | None = None
_evaluator: RAGEvaluator | None = None
_ragas_scores_cache: list[dict] = []  # in-memory cache for summary


def get_embedder() -> SentenceEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = SentenceEmbedder()
    return _embedder


def get_evaluator() -> RAGEvaluator:
    global _evaluator
    if _evaluator is None:
        _evaluator = RAGEvaluator()
    return _evaluator


def get_conversation_manager() -> ConversationManager:
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager()
    return _conversation_manager


async def get_redis_client() -> aioredis.Redis:
    """
    Get or create an async Redis connection.

    WHY async Redis?  The BM25 retriever runs in the async context
    (alongside vector search via asyncio.gather).  Using sync Redis
    would block the event loop and negate the parallelism benefit.
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_client


def _build_hybrid_retriever(
    embedder: SentenceEmbedder,
    redis_client: aioredis.Redis,
) -> HybridRetriever:
    """
    Construct a HybridRetriever with all its dependencies.

    WHY a factory function?  HybridRetriever depends on both
    QdrantRetriever and BM25Retriever, which each need their
    own dependencies (embedder, redis).  This wires everything together.
    """
    qdrant_retriever = QdrantRetriever(embedder)
    bm25_retriever = BM25Retriever(redis_client)
    return HybridRetriever(qdrant_retriever, bm25_retriever)


def _chunk_to_retrieved_chunk(hybrid_result) -> RetrievedChunk:
    """
    Convert a HybridResult back to a RetrievedChunk.

    WHY this conversion?  The LLMGenerator and ContextBudget still
    work with RetrievedChunk objects.  Rather than refactoring the
    entire downstream pipeline (risky, large change), we convert
    at the boundary.  The metadata is fully preserved.
    """
    return RetrievedChunk(
        id=hybrid_result.chunk_id,
        score=hybrid_result.score,
        document_id=hybrid_result.doc_id,
        text=hybrid_result.chunk_text,
        chunk_index=hybrid_result.chunk_index,
        doc_name=hybrid_result.doc_name,
        page_num=hybrid_result.page_num,
        section_title=hybrid_result.section_title,
        char_start=hybrid_result.char_start,
        char_end=hybrid_result.char_end,
    )


# ═══════════════════════════════════════════════════════════════════════
# EMBED ENDPOINT
# ═══════════════════════════════════════════════════════════════════════


@router.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    """
    Embed document chunks and store in both Qdrant AND BM25 index.

    Flow:
      1. Upsert vectors into Qdrant (dense embeddings).
      2. If workspace_id is provided, rebuild the BM25 index for
         that workspace so keyword search stays in sync.

    WHY rebuild the entire BM25 index instead of incremental add?
      BM25's IDF scores depend on the TOTAL corpus size.  Adding
      a single document changes IDF for every term.  A full rebuild
      (typically < 1s for < 100k chunks) guarantees score correctness.
    """
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)

        # Step 1: Upsert into Qdrant
        upserted = retriever.upsert_chunks(
            document_id=req.document_id,
            chunks=[
                {
                    "chunk_id": c.chunk_id,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "workspace_id": req.workspace_id,
                    "doc_name": c.doc_name,
                    "page_num": c.page_num,
                    "section_title": c.section_title,
                    "char_start": c.char_start,
                    "char_end": c.char_end,
                }
                for c in req.chunks
            ],
        )

        # Step 2: Rebuild BM25 index if workspace_id is provided
        bm25_count = 0
        if req.workspace_id:
            try:
                redis_client = await get_redis_client()
                bm25 = BM25Retriever(redis_client)

                # Convert chunks to the format BM25Retriever expects
                bm25_chunks = [
                    {
                        "chunk_id": c.chunk_id,
                        "text": c.text,
                        "doc_id": req.document_id,
                        "page_num": c.page_num,
                    }
                    for c in req.chunks
                ]

                bm25_count = await bm25.rebuild_index(
                    workspace_id=req.workspace_id,
                    chunks=bm25_chunks,
                )
                logger.info(
                    "BM25 index rebuilt for workspace %s: %d chunks",
                    req.workspace_id,
                    bm25_count,
                )
            except Exception as bm25_exc:
                # WHY catch separately?  Vector upsert succeeded — we don't
                # want to fail the entire request because of a BM25 issue.
                # The user can manually reindex later via /reindex endpoint.
                logger.error(
                    "BM25 index rebuild failed for workspace %s: %s",
                    req.workspace_id,
                    bm25_exc,
                    exc_info=True,
                )

        return EmbedResponse(upserted=upserted, bm25_indexed=bm25_count)

    except Exception as exc:
        logger.error(
            "Embedding failed for document %s: %s",
            req.document_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Embedding failed: {exc}"
        ) from exc


# ═══════════════════════════════════════════════════════════════════════
# QUERY ENDPOINT
# ═══════════════════════════════════════════════════════════════════════


@router.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest) -> QueryResponse:
    """
    Query the RAG pipeline.

    Decision logic:
      • If workspace_id is provided → use HYBRID retrieval (vector + BM25 + reranking)
      • If workspace_id is absent  → fall back to VECTOR-ONLY retrieval
        (preserves backward compatibility with existing clients that
        don't send workspace_id yet)
    """
    try:
        embedder = get_embedder()
        generator = LLMGenerator()
        agent_trace = []
        sub_query_results = []

        conversation_manager = get_conversation_manager()
        decomposer = QueryDecomposer(generator)
        suggestion_engine = SuggestionEngine(generator)

        conversation = None
        if req.session_id:
            conversation = conversation_manager.get_or_create_session(
                req.session_id
            )
            conversation.add_user_message(req.query)
            agent_trace.append(f"Using conversation session: {req.session_id}")

        # ── Choose retrieval strategy ──────────────────────────────
        retrieval_method = "hybrid" if req.workspace_id else "vector_only"

        if req.workspace_id:
            # HYBRID: vector + BM25 + reranking
            redis_client = await get_redis_client()
            hybrid = _build_hybrid_retriever(embedder, redis_client)
            agent_trace.append(
                "Using hybrid retrieval (vector + BM25 + reranking)"
            )
        else:
            # VECTOR-ONLY: backward compatible path
            qdrant_retriever = QdrantRetriever(embedder)
            agent_trace.append(
                "Using vector-only retrieval (no workspace_id provided)"
            )

        # ── Query decomposition (if enabled) ───────────────────────
        if req.use_decomposition and await decomposer.should_decompose(
            req.query
        ):
            agent_trace.append("Query identified as complex - decomposing")
            sub_queries = await decomposer.decompose(
                req.query, max_sub_queries=3
            )
            agent_trace.append(
                f"Decomposed into {len(sub_queries)} sub-queries"
            )

            for sq in sorted(
                sub_queries, key=lambda x: x.priority, reverse=True
            ):
                agent_trace.append(
                    f"Executing sub-query (priority {sq.priority}): {sq.question}"
                )

                # Run sub-query through the chosen retrieval path
                if req.workspace_id:
                    hybrid_matches = await hybrid.search(
                        query=sq.question,
                        workspace_id=req.workspace_id,
                        top_k=req.top_k,
                        filter_by_doc_ids=req.filter_by_doc_ids,
                    )
                    sq_matches = [
                        _chunk_to_retrieved_chunk(h) for h in hybrid_matches
                    ]
                else:
                    sq_matches = qdrant_retriever.query(
                        sq.question,
                        top_k=req.top_k,
                        workspace_id=req.workspace_id,
                        filter_by_doc_ids=req.filter_by_doc_ids,
                    )

                sq_answer = generator.generate(
                    sq.question, sq_matches, conversation_context=None
                )

                sub_query_results.append(
                    SubQueryResult(
                        question=sq.question,
                        answer=sq_answer.answer,
                        priority=sq.priority,
                        citations=[
                            Citation(
                                chunk_id=c.chunk_id,
                                document_id=c.document_id,
                                chunk_index=c.chunk_index,
                                text_snippet=c.text_snippet,
                            )
                            for c in sq_answer.citations
                        ],
                    )
                )

            synthesis_prompt = decomposer.create_synthesis_prompt(
                req.query,
                [
                    {
                        "question": sr.question,
                        "answer": sr.answer,
                        "citations": sr.citations,
                    }
                    for sr in sub_query_results
                ],
            )

            # Final retrieval for synthesis
            if req.workspace_id:
                hybrid_matches = await hybrid.search(
                    query=req.query,
                    workspace_id=req.workspace_id,
                    top_k=req.top_k,
                    filter_by_doc_ids=req.filter_by_doc_ids,
                )
                matches = [
                    _chunk_to_retrieved_chunk(h) for h in hybrid_matches
                ]
            else:
                matches = qdrant_retriever.query(
                    req.query,
                    top_k=req.top_k,
                    workspace_id=req.workspace_id,
                    filter_by_doc_ids=req.filter_by_doc_ids,
                )

            answer = generator.generate(
                synthesis_prompt,
                matches,
                conversation_context=(
                    conversation.get_context() if conversation else None
                ),
            )
            agent_trace.append(
                "Synthesized final answer from sub-query results"
            )
        else:
            # ── Standard (non-decomposed) query ────────────────────
            agent_trace.append("Executing standard query")

            if req.workspace_id:
                hybrid_matches = await hybrid.search(
                    query=req.query,
                    workspace_id=req.workspace_id,
                    top_k=req.top_k,
                    filter_by_doc_ids=req.filter_by_doc_ids,
                )
                matches = [
                    _chunk_to_retrieved_chunk(h) for h in hybrid_matches
                ]
            else:
                matches = qdrant_retriever.query(
                    req.query,
                    top_k=req.top_k,
                    workspace_id=req.workspace_id,
                    filter_by_doc_ids=req.filter_by_doc_ids,
                )

            answer = generator.generate(
                req.query,
                matches,
                conversation_context=(
                    conversation.get_context() if conversation else None
                ),
            )

        # ── Build response ─────────────────────────────────────────
        citation_schemas = [
            Citation(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                text_snippet=(
                    c.text_snippet[:200] + "..."
                    if c.text_snippet and len(c.text_snippet) > 200
                    else c.text_snippet
                ),
                # Pass through citation metadata for frontend highlighting
                page_num=getattr(c, "page_num", None),
                char_start=getattr(c, "char_start", None),
                char_end=getattr(c, "char_end", None),
            )
            for c in answer.citations
        ]

        if conversation:
            conversation.add_assistant_message(
                answer.answer, [c.dict() for c in citation_schemas]
            )

        suggestions = []
        if req.include_suggestions:
            agent_trace.append("Generating follow-up suggestions")
            suggestions = await suggestion_engine.generate_suggestions(
                current_query=req.query,
                answer=answer.answer,
                num_suggestions=3,
            )

        conversation_summary = None
        if conversation:
            conversation_summary = conversation.get_summary()

        return QueryResponse(
            answer=answer.answer,
            citations=citation_schemas,
            matches=[
                RetrievedChunkOut(
                    id=m.id,
                    score=m.score,
                    document_id=m.document_id,
                    text=m.text,
                    doc_name=m.doc_name,
                    page_num=m.page_num,
                    section_title=m.section_title,
                    char_start=m.char_start,
                    char_end=m.char_end,
                )
                for m in matches
            ],
            suggestions=suggestions,
            sub_queries=sub_query_results,
            agent_trace=agent_trace,
            conversation_summary=conversation_summary,
            retrieval_method=retrieval_method,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Query failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Query failed: {exc}"
        ) from exc


# ═══════════════════════════════════════════════════════════════════════
# REINDEX ENDPOINT
# ═══════════════════════════════════════════════════════════════════════


@router.post("/reindex/{workspace_id}")
async def reindex_bm25(workspace_id: str) -> dict:
    """
    Manually rebuild the BM25 index for a workspace from scratch.

    WHY a separate endpoint?
      • If the BM25 index gets out of sync (Redis restart, failed rebuild),
        this endpoint lets the user force a full reindex.
      • Useful during initial setup / migration when documents were
        already in Qdrant but BM25 wasn't set up yet.
      • Can be called by a cron job for periodic index freshness.

    NOTE: In production, this should pull ALL chunks for the workspace
    from Postgres.  Currently, it pulls from Qdrant payloads as a
    fallback since the Postgres integration depends on the API service.
    You should wire this to your actual chunk storage.
    """
    try:
        embedder = get_embedder()
        qdrant_retriever = QdrantRetriever(embedder)
        redis_client = await get_redis_client()
        bm25 = BM25Retriever(redis_client)

        # Pull all chunks from Qdrant for this workspace
        # WHY from Qdrant?  The RAG service doesn't have direct Postgres
        # access (that's the API service's domain).  Qdrant stores chunk
        # text in its payload, so we can reconstruct the BM25 index from it.
        # In production, replace this with a Postgres query via the API service.
        client = qdrant_retriever._client
        all_chunks = []

        # Scroll through all points in the collection
        # WHY scroll instead of search?  We need ALL chunks, not just
        # those similar to a query.  Scroll iterates the entire collection.
        offset = None
        while True:
            results, next_offset = client.scroll(
                collection_name=settings.qdrant_collection,
                limit=100,
                offset=offset,
                with_payload=True,
                scroll_filter=qm.Filter(
                    must=[
                        qm.FieldCondition(
                            key="workspace_id",
                            match=qm.MatchValue(value=workspace_id),
                        )
                    ]
                ),
            )

            for point in results:
                payload = point.payload or {}
                all_chunks.append(
                    {
                        "chunk_id": str(point.id),
                        "text": payload.get("text", ""),
                        "doc_id": payload.get("document_id", ""),
                        "page_num": payload.get("page_num"),
                    }
                )

            if next_offset is None:
                break
            offset = next_offset

        # Rebuild the BM25 index
        indexed_count = await bm25.rebuild_index(
            workspace_id=workspace_id,
            chunks=all_chunks,
        )

        return {
            "workspace_id": workspace_id,
            "indexed_chunks": indexed_count,
            "status": "success",
        }

    except Exception as exc:
        logger.error(
            "Reindex failed for workspace %s: %s",
            workspace_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Reindex failed: {exc}",
        ) from exc


# ═══════════════════════════════════════════════════════════════════════
# QUERY-CHUNKS ENDPOINT (used by Agent service's LangGraph pipeline)
# ═══════════════════════════════════════════════════════════════════════


@router.post("/query-chunks", response_model=QueryChunksResponse)
async def query_chunks(req: QueryChunksRequest) -> QueryChunksResponse:
    """
    Retrieve raw chunks with full metadata — NO LLM generation.

    WHY this endpoint exists:
      The Agent service's LangGraph pipeline needs raw chunks so it can:
        • Grade relevance with its own LLM calls (node 3)
        • Generate answers with its own prompts (node 4)
        • Check for hallucinations (node 5)

      The existing /query endpoint runs the full pipeline (retrieve → budget
      → generate), which would conflict with the agent's own generation logic.
      /query-chunks returns ONLY the retrieval results.

    Uses the hybrid retriever (vector + BM25 + reranking) when workspace_id
    is provided, otherwise falls back to vector-only search.
    """
    try:
        embedder = get_embedder()

        if req.workspace_id:
            # HYBRID: vector + BM25 + reranking
            redis_client = await get_redis_client()
            hybrid = _build_hybrid_retriever(embedder, redis_client)

            hybrid_results = await hybrid.search(
                query=req.query,
                workspace_id=req.workspace_id,
                top_k=req.top_k,
                final_top_n=req.top_k,
                filter_by_doc_ids=req.filter_by_doc_ids,
            )

            chunks = [
                ChunkOut(
                    chunk_id=r.chunk_id,
                    chunk_text=r.chunk_text,
                    score=r.score,
                    doc_id=r.doc_id,
                    doc_name=r.doc_name,
                    page_num=r.page_num,
                    section_title=r.section_title,
                    char_start=r.char_start,
                    char_end=r.char_end,
                    chunk_index=r.chunk_index,
                )
                for r in hybrid_results
            ]
            method = "hybrid"
        else:
            # VECTOR-ONLY: backward compatible
            qdrant_retriever = QdrantRetriever(embedder)
            vector_results = qdrant_retriever.query(
                query_text=req.query,
                top_k=req.top_k,
                workspace_id=req.workspace_id,
                filter_by_doc_ids=req.filter_by_doc_ids,
            )

            chunks = [
                ChunkOut(
                    chunk_id=r.id,
                    chunk_text=r.text or "",
                    score=r.score,
                    doc_id=r.document_id,
                    doc_name=r.doc_name,
                    page_num=r.page_num,
                    section_title=r.section_title,
                    char_start=r.char_start,
                    char_end=r.char_end,
                    chunk_index=r.chunk_index,
                )
                for r in vector_results
            ]
            method = "vector_only"

        return QueryChunksResponse(
            chunks=chunks,
            retrieval_method=method,
            total_candidates=len(chunks),
        )

    except Exception as exc:
        logger.error("query-chunks failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Chunk retrieval failed: {exc}",
        ) from exc


# ═══════════════════════════════════════════════════════════════════════
# DELETE ENDPOINT (unchanged)
# ═══════════════════════════════════════════════════════════════════════


@router.delete("/documents/{document_id}/vectors")
def delete_document_vectors(document_id: str) -> dict[str, bool]:
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        deleted = retriever.delete_by_document(document_id)
        logger.info("Deleted %d vectors for document %s", deleted, document_id)
        return {"deleted": True}
    except Exception as exc:
        logger.error("Failed to delete vectors for document %s: %s", document_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ═══════════════════════════════════════════════════════════════════════
# RAGAS EVALUATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════


class EvalRequest(BaseModel):
    question: str
    answer: str
    contexts: list[str]
    ground_truth: Optional[str] = None
    workspace_id: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/eval")
async def evaluate_rag(req: EvalRequest) -> dict:
    """
    Run RAGAS evaluation on a Q&A pair.

    Returns scores for faithfulness, answer_relevancy,
    context_recall, context_precision, and overall.
    """
    evaluator = get_evaluator()
    scores = await evaluator.evaluate_response(
        req.question, req.answer, req.contexts, req.ground_truth
    )

    # Cache for summary endpoint
    _ragas_scores_cache.append(scores)
    if len(_ragas_scores_cache) > 100:
        _ragas_scores_cache.pop(0)

    return scores


@router.get("/eval/summary")
async def eval_summary() -> dict:
    """
    Return average RAGAS scores across the last 100 evaluated queries.
    Useful for the analytics dashboard benchmark table.
    """
    if not _ragas_scores_cache:
        return {
            "count": 0,
            "faithfulness": 0.0,
            "answer_relevancy": 0.0,
            "context_recall": 0.0,
            "context_precision": 0.0,
            "overall": 0.0,
        }

    n = len(_ragas_scores_cache)
    keys = ["faithfulness", "answer_relevancy", "context_recall", "context_precision", "overall"]
    averages = {
        k: round(sum(s.get(k, 0) for s in _ragas_scores_cache) / n, 4)
        for k in keys
    }
    averages["count"] = n
    return averages


# ═══════════════════════════════════════════════════════════════════════
# QUERY HISTORY + SIMILAR QUERIES
# ═══════════════════════════════════════════════════════════════════════


class QueryHistoryRequest(BaseModel):
    question: str
    answer: str
    workspace_id: str
    session_id: Optional[str] = None


@router.post("/query-history")
async def store_query_history(req: QueryHistoryRequest) -> dict:
    """
    Store a Q&A pair as a vector in the query_history Qdrant collection.
    Called by the Node.js API after a successful query.
    """
    if not settings.query_history_enabled:
        return {"stored": False, "reason": "disabled"}

    embedder = get_embedder()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: qh.store_query(
            embedder, req.question, req.answer, req.workspace_id, req.session_id
        ),
    )
    return {"stored": True}


@router.get("/similar-queries")
async def similar_queries(
    q: str = Query(..., min_length=3, max_length=500),
    workspace_id: str = Query(...),
    top_k: int = Query(5, ge=1, le=20),
) -> dict:
    """
    Find semantically similar past queries from query history.
    Used by the analytics page to show "Questions like this have been asked before".
    """
    if not settings.query_history_enabled:
        return {"results": []}

    embedder = get_embedder()
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: qh.find_similar(embedder, q, workspace_id, top_k),
    )
    return {"results": results, "query": q}
