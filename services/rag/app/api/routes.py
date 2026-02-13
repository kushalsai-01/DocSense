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

# Initialize components once (lazy-loaded)
_embedder: SentenceEmbedder | None = None
_conversation_manager: ConversationManager | None = None


def get_embedder() -> SentenceEmbedder:
    """Get or create the embedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = SentenceEmbedder()
    return _embedder


def get_conversation_manager() -> ConversationManager:
    """Get or create the conversation manager instance."""
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
    """
    Answer question with RAG + Agent capabilities.
    Supports:
    - Conversation memory (session_id)
    - Query decomposition (use_decomposition=true)
    - Follow-up suggestions (include_suggestions=true)
    """
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        generator = LLMGenerator()
        
        agent_trace = []  # Track agent reasoning steps
        sub_query_results = []
        
        # Initialize agentic components
        conversation_manager = get_conversation_manager()
        decomposer = QueryDecomposer(generator)
        suggestion_engine = SuggestionEngine(generator)
        
        # Get conversation memory if session_id provided
        conversation = None
        if req.session_id:
            conversation = conversation_manager.get_or_create_session(req.session_id)
            conversation.add_user_message(req.query)
            agent_trace.append(f"Using conversation session: {req.session_id}")
        
        # Optionally decompose complex queries
        if req.use_decomposition and await decomposer.should_decompose(req.query):
            agent_trace.append("Query identified as complex - decomposing")
            
            sub_queries = await decomposer.decompose(req.query, max_sub_queries=3)
            agent_trace.append(f"Decomposed into {len(sub_queries)} sub-queries")
            
            # Execute each sub-query
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
            
            # Synthesize final answer from sub-query results
            synthesis_prompt = decomposer.create_synthesis_prompt(
                req.query,
                [{"question": sr.question, "answer": sr.answer, "citations": sr.citations} for sr in sub_query_results]
            )
            
            # Get all unique matches from sub-queries
            all_matches = []
            seen_ids = set()
            for sr in sub_query_results:
                for citation in sr.citations:
                    if citation.chunk_id not in seen_ids:
                        seen_ids.add(citation.chunk_id)
                        # Note: We'd need to fetch the actual match object here
                        # For now, we'll reconstruct from citations
            
            # Use generator for final synthesis
            matches = retriever.query(req.query, top_k=req.top_k)
            answer = generator.generate(synthesis_prompt, matches, conversation_context=conversation.get_context() if conversation else None)
            agent_trace.append("Synthesized final answer from sub-query results")
        
        else:
            # Standard single-query RAG
            agent_trace.append("Executing standard query")
            matches = retriever.query(req.query, top_k=req.top_k)
            answer = generator.generate(req.query, matches, conversation_context=conversation.get_context() if conversation else None)
        
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
        
        # Add assistant response to conversation memory
        if conversation:
            conversation.add_assistant_message(answer.answer, [c.dict() for c in citation_schemas])
        
        # Generate follow-up suggestions
        suggestions = []
        if req.include_suggestions:
            agent_trace.append("Generating follow-up suggestions")
            suggestions = await suggestion_engine.generate_suggestions(
                current_query=req.query,
                answer=answer.answer,
                num_suggestions=3
            )
        
        # Get conversation summary if session exists
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
    """Delete all Qdrant vectors associated with a document."""
    try:
        embedder = get_embedder()
        retriever = QdrantRetriever(embedder)
        deleted = retriever.delete_by_document(document_id)
        logger.info("Deleted %d vectors for document %s", deleted, document_id)
        return {"deleted": True}
    except Exception as exc:
        logger.error("Failed to delete vectors for document %s: %s", document_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
