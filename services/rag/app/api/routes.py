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
    SubQueryResult,
)
from app.core.settings import settings
from app.embeddings.sentence_embedder import SentenceEmbedder
from app.generator.llm_generator import LLMGenerator
from app.retriever.qdrant_retriever import QdrantRetriever
from app.agent.memory import ConversationManager
from app.agent.decomposer import QueryDecomposer
from app.agent.suggestions import SuggestionEngine
logger = logging.getLogger(__name__)
router = APIRouter()
_embedder: SentenceEmbedder | None = None
_conversation_manager: ConversationManager | None = None
def get_embedder() -> SentenceEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = SentenceEmbedder()
    return _embedder
def get_conversation_manager() -> ConversationManager:
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager()
    return _conversation_manager
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
async def query(req: QueryRequest) -> QueryResponse:
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        generator = LLMGenerator()
        agent_trace = []
        sub_query_results = []
        conversation_manager = get_conversation_manager()
        decomposer = QueryDecomposer(generator)
        suggestion_engine = SuggestionEngine(generator)
        conversation = None
        if req.session_id:
            conversation = conversation_manager.get_or_create_session(req.session_id)
            conversation.add_user_message(req.query)
            agent_trace.append(f"Using conversation session: {req.session_id}")
        if req.use_decomposition and await decomposer.should_decompose(req.query):
            agent_trace.append("Query identified as complex - decomposing")
            sub_queries = await decomposer.decompose(req.query, max_sub_queries=3)
            agent_trace.append(f"Decomposed into {len(sub_queries)} sub-queries")
            for sq in sorted(sub_queries, key=lambda x: x.priority, reverse=True):
                agent_trace.append(f"Executing sub-query (priority {sq.priority}): {sq.question}")
                sq_matches = retriever.query(sq.question, top_k=req.top_k)
                sq_answer = generator.generate(sq.question, sq_matches, conversation_context=None)
                sub_query_results.append(SubQueryResult(
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
                    ]
                ))
            synthesis_prompt = decomposer.create_synthesis_prompt(
                req.query,
                [{"question": sr.question, "answer": sr.answer, "citations": sr.citations} for sr in sub_query_results]
            )
            all_matches = []
            seen_ids = set()
            for sr in sub_query_results:
                for citation in sr.citations:
                    if citation.chunk_id not in seen_ids:
                        seen_ids.add(citation.chunk_id)
            matches = retriever.query(req.query, top_k=req.top_k)
            answer = generator.generate(synthesis_prompt, matches, conversation_context=conversation.get_context() if conversation else None)
            agent_trace.append("Synthesized final answer from sub-query results")
        else:
            agent_trace.append("Executing standard query")
            matches = retriever.query(req.query, top_k=req.top_k)
            answer = generator.generate(req.query, matches, conversation_context=conversation.get_context() if conversation else None)
        citation_schemas = [
            Citation(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                text_snippet=c.text_snippet,
            )
            for c in answer.citations
        ]
        if conversation:
            conversation.add_assistant_message(answer.answer, [c.dict() for c in citation_schemas])
        suggestions = []
        if req.include_suggestions:
            agent_trace.append("Generating follow-up suggestions")
            suggestions = await suggestion_engine.generate_suggestions(
                current_query=req.query,
                answer=answer.answer,
                num_suggestions=3
            )
        conversation_summary = None
        if conversation:
            conversation_summary = conversation.get_summary()
        return QueryResponse(
            answer=answer.answer,
            citations=citation_schemas,
            matches=[
                RetrievedChunkOut(id=m.id, score=m.score, document_id=m.document_id, text=m.text) for m in matches
            ],
            suggestions=suggestions,
            sub_queries=sub_query_results,
            agent_trace=agent_trace,
            conversation_summary=conversation_summary
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Query failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc
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
