"""
LangGraph StateGraph Agent — 5-node DAG with self-correction.

WHY replace the old executor with LangGraph?
─────────────────────────────────────────────
The original executor.py was a linear ReAct loop:
  plan → execute tools sequentially → synthesize → maybe retry

Problems with that approach:
  1. No conditional routing — couldn't dynamically decide "I need more chunks"
     without awkward if/else nesting inside a monolithic `execute()` method.
  2. No structured state — data flowed through method arguments and instance
     variables, making it hard to reason about what was available at each step.
  3. No self-correction loop — if the answer hallucinated, it either accepted
     the bad answer or did a full re-search (wasteful).

LangGraph solves all three:
  • Each node is a PURE FUNCTION of state → state (easy to test, reason about).
  • Conditional edges enable loops (grader → retriever retry) without spaghetti.
  • The graph is serialisable, visualisable, and debuggable.

Graph topology:
  ┌──────────────┐
  │ START         │
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │ query_analyzer│  Classify query type, decompose into sub-queries
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │ retriever     │  HTTP call to RAG /query-chunks for each sub-query
  └──────┬───────┘
         ▼
  ┌──────────────┐     not enough chunks
  │ relevance     │──────────────────────┐
  │ grader        │                      │
  └──────┬───────┘                       ▼
         │ enough chunks          ┌──────────────┐
         ▼                        │ retriever     │ (retry with rewritten query)
  ┌──────────────┐                └──────────────┘
  │ generator     │  Generate answer with inline [chunk_id] citations
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │ hallucination │  Verify every claim has chunk support; self-correct if not
  │ checker       │
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │ END           │
  └──────────────┘
"""

from __future__ import annotations

import json
import logging
import re
from typing import TypedDict

import httpx
from langgraph.graph import StateGraph, END

from app.agent.router import LLMRouter
from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from langsmith import traceable as _traceable
except ImportError:
    def _traceable(**_kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator


# ═══════════════════════════════════════════════════════════════════════
# STATE SCHEMA
# ═══════════════════════════════════════════════════════════════════════
# WHY TypedDict?  LangGraph requires a TypedDict (not a dataclass)
# because it uses structural typing to merge partial state updates
# returned by each node.  Each node returns ONLY the keys it modifies,
# and LangGraph merges them into the full state automatically.
# ═══════════════════════════════════════════════════════════════════════


class AgentState(TypedDict, total=False):
    """
    Full state flowing through the LangGraph agent.

    Every node reads what it needs and writes what it produces.
    Fields marked with comments show which node writes them.
    """

    # ── Input (set by the caller before graph.ainvoke) ─────────
    query: str                    # User's original question
    workspace_id: str             # Workspace scope for retrieval
    session_id: str               # Conversation session ID

    # ── Written by query_analyzer_node ─────────────────────────
    query_type: str               # "factual" | "comparative" | "summarization"
    sub_queries: list[str]        # Decomposed retrieval sub-queries

    # ── Written by retriever_node ──────────────────────────────
    retrieved_chunks: list[dict]  # Raw chunks from RAG service

    # ── Written by relevance_grader_node ───────────────────────
    graded_chunks: list[dict]     # Chunks that passed relevance grading
    low_confidence: bool          # True if we couldn't find enough relevant chunks

    # ── Written by generator_node ──────────────────────────────
    answer: str                   # Final answer text
    citations: list[dict]         # Structured citation objects

    # ── Written by hallucination_checker_node ──────────────────
    hallucination_safe: bool      # True if all claims are grounded

    # ── Control flow ───────────────────────────────────────────
    retry_count: int              # Number of retriever retries so far
    suggestions: list[str]        # Follow-up question suggestions
    error: str | None             # Error message if something failed


# ═══════════════════════════════════════════════════════════════════════
# HELPER: Parse JSON from LLM responses
# ═══════════════════════════════════════════════════════════════════════

def _parse_llm_json(text: str) -> dict:
    """
    Robustly extract JSON from an LLM response.

    WHY this helper?  LLMs often wrap JSON in ```json ... ``` markdown
    code fences, or add preamble text before/after the JSON object.
    This function handles all common output formats.
    """
    text = text.strip()

    # Strip markdown code fences
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find the first { ... } block — handles preamble/postamble text
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return {}


# ═══════════════════════════════════════════════════════════════════════
# NODE 1 — QUERY ANALYZER
# ═══════════════════════════════════════════════════════════════════════
# WHY a dedicated analyzer node?
# Different query types need different retrieval strategies:
#   • Factual: "What is the API rate limit?" → single search
#   • Comparative: "Compare pricing of plan A vs plan B" → one search per topic
#   • Summarization: "Summarize the security section" → broad search with prefix
#
# By classifying and decomposing BEFORE retrieval, we send more targeted
# sub-queries to the hybrid retriever, dramatically improving recall.
# ═══════════════════════════════════════════════════════════════════════

QUERY_ANALYZER_SYSTEM_PROMPT = """You are a query analysis engine for a document intelligence system.
Your job is to classify the user's query and decompose it into optimal retrieval sub-queries.

CLASSIFICATION RULES:
- "factual": The user asks a specific question with a concrete answer.
  Examples: "What is the API rate limit?", "When was the contract signed?"
  → sub_queries = [the original query, verbatim]

- "comparative": The user wants to compare, contrast, or differentiate between
  two or more topics, documents, sections, or concepts.
  Examples: "Compare pricing in plan A vs plan B", "What are the differences between v1 and v2?"
  → sub_queries = one separate sub-query per topic/entity being compared.
    Each sub-query should retrieve information about ONE side of the comparison.

- "summarization": The user wants an overview, summary, or broad explanation.
  Examples: "Summarize chapter 3", "Give me an overview of the security architecture"
  → sub_queries = ["summarize: " + the original query]

RESPONSE FORMAT (strict JSON, no extra text):
{
  "query_type": "factual" | "comparative" | "summarization",
  "sub_queries": ["..."],
  "requires_multiple_docs": true | false
}

RULES:
1. Always return valid JSON. No markdown, no explanation outside JSON.
2. sub_queries must be non-empty. Minimum 1, maximum 5.
3. Each sub-query should be a self-contained search query (not a sentence fragment).
4. requires_multiple_docs = true when the answer likely spans multiple uploaded documents."""


@_traceable(name="query_analyzer_node", tags=["planning"])
async def query_analyzer_node(state: AgentState) -> dict:
    """
    NODE 1: Analyze the query and decompose into sub-queries.

    Input:  state.query
    Output: state.query_type, state.sub_queries
    """
    query = state["query"]
    llm = _get_llm_router()

    try:
        response = await llm.agenerate(
            prompt=f'Analyze this query and respond with JSON:\n\n"{query}"',
            system_prompt=QUERY_ANALYZER_SYSTEM_PROMPT,
            max_tokens=500,
            temperature=0.0,
        )

        parsed = _parse_llm_json(response)
        query_type = parsed.get("query_type", "factual")
        sub_queries = parsed.get("sub_queries", [query])

        # Validate: ensure we have at least one sub-query
        if not sub_queries:
            sub_queries = [query]

        # Cap at 5 sub-queries to prevent runaway decomposition
        sub_queries = sub_queries[:5]

        logger.info(
            "query_analyzed: type=%s, sub_queries=%d",
            query_type,
            len(sub_queries),
        )

        return {
            "query_type": query_type,
            "sub_queries": sub_queries,
        }

    except Exception as exc:
        # WHY fallback instead of raising?  The analyzer is an OPTIMIZATION.
        # If it fails, we can still search with the original query.
        logger.warning("query_analyzer_failed: %s", exc)
        return {
            "query_type": "factual",
            "sub_queries": [query],
        }


# ═══════════════════════════════════════════════════════════════════════
# NODE 2 — RETRIEVER
# ═══════════════════════════════════════════════════════════════════════
# WHY call the RAG service via HTTP instead of importing directly?
# The Agent and RAG services are separate microservices (separate Docker
# containers in production).  This boundary enables:
#   • Independent scaling (agent can be CPU-only, RAG needs GPU for embeddings)
#   • Independent deployment (update retrieval without touching agent logic)
#   • Clear contract (the /query-chunks endpoint is the interface)
# ═══════════════════════════════════════════════════════════════════════


@_traceable(name="retriever_node", tags=["retrieval"])
async def retriever_node(state: AgentState) -> dict:
    """
    NODE 2: Retrieve chunks from the RAG service for each sub-query.

    Input:  state.sub_queries, state.workspace_id
    Output: state.retrieved_chunks (deduplicated by chunk_id)

    Calls the RAG service's /query-chunks endpoint, which returns
    raw chunks (no LLM generation — that's our job in generator_node).
    """
    sub_queries = state.get("sub_queries", [state["query"]])
    workspace_id = state.get("workspace_id", "")
    all_chunks: list[dict] = []
    seen_ids: set[str] = set()

    rag_url = settings.rag_service_url.rstrip("/")

    async with httpx.AsyncClient(timeout=settings.rag_service_timeout) as client:
        for sq in sub_queries:
            try:
                resp = await client.post(
                    f"{rag_url}/query-chunks",
                    json={
                        "query": sq,
                        "workspace_id": workspace_id,
                        "top_k": 10,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                chunks = data.get("chunks", [])

                # Deduplicate: same chunk might appear for different sub-queries
                # WHY deduplicate here?  If sub-query A and sub-query B both
                # retrieve chunk X, sending it twice to the grader wastes LLM tokens
                # and inflates the graded_chunks list with redundant entries.
                for chunk in chunks:
                    cid = chunk.get("chunk_id", "")
                    if cid and cid not in seen_ids:
                        seen_ids.add(cid)
                        all_chunks.append(chunk)

                logger.info(
                    "retriever: sub_query='%.60s' returned %d chunks",
                    sq,
                    len(chunks),
                )

            except Exception as exc:
                logger.error(
                    "retriever: failed for sub_query='%.60s': %s", sq, exc
                )
                # WHY continue instead of raising?  Partial results are better
                # than no results.  If one sub-query fails (e.g. network blip),
                # the other sub-queries may still return useful chunks.

    logger.info(
        "retriever: total %d unique chunks from %d sub-queries",
        len(all_chunks),
        len(sub_queries),
    )

    return {"retrieved_chunks": all_chunks}


# ═══════════════════════════════════════════════════════════════════════
# NODE 3 — RELEVANCE GRADER
# ═══════════════════════════════════════════════════════════════════════
# WHY grade chunks before sending to the generator?
# Raw retrieval results often include noise — chunks that are
# topically adjacent but don't actually help answer the question.
# The grader acts as a FILTER, keeping only chunks that genuinely
# contribute to the answer.  This dramatically reduces hallucination
# because the generator sees fewer irrelevant passages.
#
# Self-correction loop:
#   If too few chunks pass grading (< 3), the grader rewrites the
#   query to expand recall and routes back to the retriever.
#   This loop runs at most 2 times to prevent infinite cycles.
# ═══════════════════════════════════════════════════════════════════════

RELEVANCE_GRADING_PROMPT = """You are grading the relevance of a retrieved document chunk to a user query.

User Query: "{query}"

Chunk Text:
---
{chunk_text}
---

Is this chunk relevant to answering the user's query?

Respond with ONLY one of these three words:
- relevant   (chunk directly helps answer the query)
- partial    (chunk has some useful information but not directly on-topic)
- irrelevant (chunk does not help answer the query at all)

Your response (one word only):"""


QUERY_REWRITE_PROMPT = """The following search query did not return enough relevant results.
Rewrite it to be broader or use alternative terms that might match better.

Original query: "{query}"

Return ONLY the rewritten query text, nothing else."""


@_traceable(name="relevance_grader_node", tags=["grading"])
async def relevance_grader_node(state: AgentState) -> dict:
    """
    NODE 3: Grade each chunk's relevance, trigger retry if too few pass.

    Input:  state.retrieved_chunks, state.query, state.retry_count
    Output: state.graded_chunks (or state.sub_queries + state.retry_count for retry)

    Decision logic:
      • If >= 3 graded chunks: proceed to generator (enough context)
      • If < 3 AND retry_count < 2: rewrite query, increment retry, route to retriever
      • If < 3 AND retry_count >= 2: proceed with whatever we have (set low_confidence)
    """
    chunks = state.get("retrieved_chunks", [])
    query = state["query"]
    retry_count = state.get("retry_count", 0)
    llm = _get_llm_router()

    graded: list[dict] = []

    for chunk in chunks:
        chunk_text = chunk.get("chunk_text", "") or chunk.get("text", "")
        if not chunk_text:
            continue

        try:
            response = await llm.agenerate(
                prompt=RELEVANCE_GRADING_PROMPT.format(
                    query=query, chunk_text=chunk_text[:1000]
                ),
                max_tokens=10,
                temperature=0.0,
            )

            grade = response.strip().lower()

            # Keep "relevant" and "partial" chunks, discard "irrelevant"
            # WHY keep "partial"?  Partial chunks may contain supporting
            # context that, combined with other chunks, enables a complete
            # answer.  Discarding them would be too aggressive.
            if grade in ("relevant", "partial"):
                graded.append(chunk)

        except Exception as exc:
            # WHY keep chunk on error?  If we can't grade it, it's safer
            # to include it (false positive) than exclude it (false negative).
            # The generator can still use it, and hallucination checker
            # will catch any problems downstream.
            logger.warning("grading_failed for chunk: %s", exc)
            graded.append(chunk)

    logger.info(
        "relevance_grader: %d/%d chunks passed grading (retry_count=%d)",
        len(graded),
        len(chunks),
        retry_count,
    )

    # ── Decision: enough chunks or need retry? ─────────────────
    if len(graded) >= 3 or retry_count >= 2:
        # Proceed to generator with what we have
        return {
            "graded_chunks": graded,
            "low_confidence": len(graded) < 3,
        }

    # ── Not enough chunks — rewrite and retry ──────────────────
    # WHY rewrite instead of just retrying the same query?
    # The same query will hit the same index entries and return the
    # same results.  Rewriting with broader/alternative terms gives
    # the retriever a chance to find different relevant chunks.
    try:
        rewritten = await llm.agenerate(
            prompt=QUERY_REWRITE_PROMPT.format(query=query),
            max_tokens=200,
            temperature=0.3,
        )
        new_query = rewritten.strip()
        logger.info(
            "relevance_grader: rewriting query for retry: '%.80s'",
            new_query,
        )
    except Exception:
        new_query = query  # Fallback: retry with original

    return {
        "graded_chunks": graded,  # Keep what we have so far
        "sub_queries": [new_query],
        "retry_count": retry_count + 1,
        "low_confidence": False,
    }


def _should_retry_retrieval(state: AgentState) -> str:
    """
    Conditional edge: decide whether to retry retrieval or proceed to generation.

    WHY a separate function?  LangGraph conditional edges require a
    function that returns the NAME of the next node as a string.
    This keeps the routing logic testable and separate from node logic.
    """
    graded = state.get("graded_chunks", [])
    retry_count = state.get("retry_count", 0)

    if len(graded) < 3 and retry_count < 2:
        # Not enough relevant chunks and we haven't exhausted retries
        return "retriever"
    else:
        # Enough chunks OR max retries reached — proceed to generate
        return "generator"


# ═══════════════════════════════════════════════════════════════════════
# NODE 4 — GENERATOR
# ═══════════════════════════════════════════════════════════════════════
# WHY generate in the Agent instead of using the RAG service's /query?
# The RAG /query endpoint returns a pre-built answer using its own prompts.
# But the LangGraph agent needs fine-grained control over:
#   • Which chunks go into the prompt (only graded ones)
#   • How citations are formatted (inline [chunk_id] tags)
#   • The system prompt (tailored to query_type)
# So we retrieve RAW chunks via /query-chunks and generate here.
# ═══════════════════════════════════════════════════════════════════════

GENERATOR_SYSTEM_PROMPT = """You are a document intelligence assistant that answers questions using ONLY the provided context chunks.

STRICT RULES:
1. Answer the question using ONLY information from the provided context chunks.
2. For every sentence in your answer that uses information from a chunk, append the chunk's ID in square brackets immediately after that sentence. Example: "The API rate limit is 1000 requests per minute. [chunk_abc123]"
3. If a sentence draws from multiple chunks, cite all of them: "Feature X was introduced in v2 and deprecated in v3. [chunk_111][chunk_222]"
4. Do NOT add any information that is not present in the chunks. If you cannot answer from the provided context, say: "I don't have sufficient information in the provided documents to answer this question."
5. Do NOT invent or hallucinate facts. Every factual claim must trace back to a chunk.
6. Structure your answer clearly with headers, bullet points, or numbered lists when appropriate.
7. Never reference chunks by their IDs in the natural text — only use [chunk_id] as citation markers at the end of sentences.

CONTEXT CHUNKS:
{chunks_text}

USER QUERY: {query}

Provide your answer below, citing every factual claim with the appropriate [chunk_id]:"""


@_traceable(name="generator_node", tags=["generation"])
async def generator_node(state: AgentState) -> dict:
    """
    NODE 4: Generate an answer with inline citations from graded chunks.

    Input:  state.graded_chunks, state.query, state.query_type
    Output: state.answer, state.citations, state.suggestions
    """
    graded_chunks = state.get("graded_chunks", [])
    query = state["query"]
    llm = _get_llm_router()

    if not graded_chunks:
        return {
            "answer": "I don't have sufficient information in the provided documents to answer this question.",
            "citations": [],
            "suggestions": [],
        }

    # ── Build chunks text for the prompt ───────────────────────
    # WHY include chunk_id in the prompt?  The LLM needs to know the ID
    # of each chunk so it can cite them with [chunk_id] markers.
    # We also include page_num and doc_name for the LLM's context awareness
    # (helps it make better attribution decisions).
    chunks_text_parts = []
    chunk_metadata_map: dict[str, dict] = {}  # chunk_id → full metadata

    for i, chunk in enumerate(graded_chunks, 1):
        cid = chunk.get("chunk_id", f"chunk_{i}")
        text = chunk.get("chunk_text", "") or chunk.get("text", "")
        doc_name = chunk.get("doc_name", "Unknown")
        page_num = chunk.get("page_num", "?")

        chunks_text_parts.append(
            f"--- Chunk ID: {cid} | Document: {doc_name} | Page: {page_num} ---\n"
            f"{text}\n"
        )

        # Store full metadata for citation extraction later
        chunk_metadata_map[cid] = {
            "chunk_id": cid,
            "doc_name": chunk.get("doc_name"),
            "doc_id": chunk.get("doc_id"),
            "page_num": chunk.get("page_num"),
            "text_snippet": text[:200] + "..." if len(text) > 200 else text,
            "char_start": chunk.get("char_start"),
            "char_end": chunk.get("char_end"),
        }

    chunks_text = "\n".join(chunks_text_parts)

    # ── Generate answer ────────────────────────────────────────
    try:
        raw_answer = await llm.agenerate(
            prompt=GENERATOR_SYSTEM_PROMPT.format(
                chunks_text=chunks_text,
                query=query,
            ),
            max_tokens=2500,
            temperature=0.1,
        )
    except Exception as exc:
        logger.error("generator: LLM generation failed: %s", exc)
        return {
            "answer": "I encountered an error while generating the answer. Please try again.",
            "citations": [],
            "suggestions": [],
            "error": str(exc),
        }

    # ── Parse citations from [chunk_id] tags ───────────────────
    # WHY regex extraction?  The LLM embeds chunk IDs as [chunk_abc123]
    # inline in the text.  We need to:
    #   1. Extract all unique cited chunk IDs
    #   2. Map each to its full metadata (doc_name, page_num, etc.)
    #   3. Clean the answer text (optionally keep or remove the tags)
    cited_ids = set(re.findall(r"\[([^\]]+)\]", raw_answer))
    citations = []

    for cid in cited_ids:
        if cid in chunk_metadata_map:
            citations.append(chunk_metadata_map[cid])

    # ── Generate follow-up suggestions ─────────────────────────
    suggestions = await _generate_suggestions(llm, query, raw_answer)

    return {
        "answer": raw_answer,
        "citations": citations,
        "suggestions": suggestions,
    }


# ═══════════════════════════════════════════════════════════════════════
# NODE 5 — HALLUCINATION CHECKER
# ═══════════════════════════════════════════════════════════════════════
# WHY check for hallucinations?
# LLMs can subtly "fill in gaps" by inventing plausible-sounding facts
# that aren't in any source chunk.  Common failure modes:
#   • Adding specific numbers/dates that sound right but aren't sourced
#   • Generalising from one chunk's specifics to broader claims
#   • Connecting two chunks' ideas with unsourced causal reasoning
#
# The hallucination checker is a separate LLM call that cross-references
# the answer against the source chunks.  If unsupported claims are found,
# it triggers targeted regeneration of those specific sentences.
# ═══════════════════════════════════════════════════════════════════════

HALLUCINATION_CHECK_PROMPT = """You are a fact-checking system. Review the following answer and source chunks.
Your job is to determine if every factual claim in the answer is supported by at least one source chunk.

SOURCE CHUNKS:
{chunks_text}

ANSWER TO CHECK:
{answer}

INSTRUCTIONS:
1. Go through each factual claim in the answer.
2. For each claim, check if there is a supporting source chunk.
3. A claim is "supported" if a source chunk contains the same information (even if worded differently).
4. A claim is "unsupported" if NO source chunk contains that information.
5. Ignore meta-statements like "Based on the documents..." or "I don't have information..." — those are not factual claims.

Respond with ONLY this JSON (no other text):
{{
  "safe": true/false,
  "unsupported_claims": ["list of unsupported factual claims, or empty if safe"]
}}"""


HALLUCINATION_FIX_PROMPT = """The following sentences in your answer were flagged as unsupported by the source documents:

UNSUPPORTED CLAIMS:
{unsupported_claims}

SOURCE CHUNKS (for reference):
{chunks_text}

ORIGINAL ANSWER:
{answer}

INSTRUCTIONS:
For each unsupported claim, either:
1. Find support in the source chunks and add the proper [chunk_id] citation
2. OR remove the claim and replace it with "This information is not available in the provided documents."

Return the CORRECTED full answer (with proper [chunk_id] citations on supported sentences):"""


@_traceable(name="hallucination_checker_node", tags=["evaluation"])
async def hallucination_checker_node(state: AgentState) -> dict:
    """
    NODE 5: Verify answer groundedness, fix unsupported claims.

    Input:  state.answer, state.graded_chunks, state.citations
    Output: state.hallucination_safe, state.answer (possibly corrected)
    """
    answer = state.get("answer", "")
    graded_chunks = state.get("graded_chunks", [])
    llm = _get_llm_router()

    if not answer or not graded_chunks:
        return {"hallucination_safe": True}

    # Build source text for the checker
    chunks_text_parts = []
    for chunk in graded_chunks:
        cid = chunk.get("chunk_id", "")
        text = chunk.get("chunk_text", "") or chunk.get("text", "")
        chunks_text_parts.append(f"[{cid}]: {text[:500]}")
    chunks_text = "\n\n".join(chunks_text_parts)

    try:
        # ── Step 1: Check for hallucinations ───────────────────
        check_response = await llm.agenerate(
            prompt=HALLUCINATION_CHECK_PROMPT.format(
                chunks_text=chunks_text,
                answer=answer,
            ),
            max_tokens=500,
            temperature=0.0,
        )

        result = _parse_llm_json(check_response)
        is_safe = result.get("safe", True)
        unsupported = result.get("unsupported_claims", [])

        if is_safe or not unsupported:
            logger.info("hallucination_check: PASSED (all claims grounded)")
            return {"hallucination_safe": True}

        # ── Step 2: Fix unsupported claims ─────────────────────
        # WHY fix instead of just flagging?  The user expects a usable answer,
        # not an error message.  By correcting the specific problematic
        # sentences (rather than regenerating everything), we preserve the
        # good parts of the answer while fixing the bad parts.
        logger.warning(
            "hallucination_check: FAILED — %d unsupported claims: %s",
            len(unsupported),
            unsupported,
        )

        fixed_answer = await llm.agenerate(
            prompt=HALLUCINATION_FIX_PROMPT.format(
                unsupported_claims="\n".join(f"- {c}" for c in unsupported),
                chunks_text=chunks_text,
                answer=answer,
            ),
            max_tokens=2500,
            temperature=0.1,
        )

        # Re-extract citations from the fixed answer
        cited_ids = set(re.findall(r"\[([^\]]+)\]", fixed_answer))
        chunk_map = {
            c.get("chunk_id", ""): c for c in graded_chunks
        }
        updated_citations = []
        for cid in cited_ids:
            if cid in chunk_map:
                ch = chunk_map[cid]
                text = ch.get("chunk_text", "") or ch.get("text", "")
                updated_citations.append({
                    "chunk_id": cid,
                    "doc_name": ch.get("doc_name"),
                    "doc_id": ch.get("doc_id"),
                    "page_num": ch.get("page_num"),
                    "text_snippet": text[:200] + "..." if len(text) > 200 else text,
                    "char_start": ch.get("char_start"),
                    "char_end": ch.get("char_end"),
                })

        logger.info("hallucination_check: answer corrected successfully")
        return {
            "hallucination_safe": True,
            "answer": fixed_answer,
            "citations": updated_citations,
        }

    except Exception as exc:
        # WHY not fail hard?  The hallucination checker is a quality layer.
        # If it errors out, the answer from the generator is still usable —
        # it was generated from graded chunks, so it's likely mostly grounded.
        # Better to serve a potentially imperfect answer than no answer.
        logger.warning("hallucination_check: failed with error: %s", exc)
        return {"hallucination_safe": False}


# ═══════════════════════════════════════════════════════════════════════
# HELPER: Generate follow-up suggestions
# ═══════════════════════════════════════════════════════════════════════

async def _generate_suggestions(
    llm: LLMRouter, query: str, answer: str
) -> list[str]:
    """Generate 3 follow-up question suggestions based on the Q&A pair."""
    prompt = (
        f'Based on the question "{query}" and answer "{answer[:500]}", '
        f"suggest 3 concise follow-up questions (under 15 words each). "
        f'Return as JSON array: ["Q1?", "Q2?", "Q3?"]'
    )
    try:
        response = await llm.agenerate(
            prompt=prompt, max_tokens=300, temperature=0.7
        )
        parsed = json.loads(response.strip().replace("```json", "").replace("```", ""))
        return parsed[:3] if isinstance(parsed, list) else []
    except Exception:
        return [
            "Can you provide more details?",
            "What else should I know about this?",
            "How does this relate to other documents?",
        ]


# ═══════════════════════════════════════════════════════════════════════
# SINGLETON: LLM Router
# ═══════════════════════════════════════════════════════════════════════

_llm_router_instance: LLMRouter | None = None


def _get_llm_router() -> LLMRouter:
    """Reuse a single LLMRouter instance across all graph invocations."""
    global _llm_router_instance
    if _llm_router_instance is None:
        _llm_router_instance = LLMRouter()
    return _llm_router_instance


# ═══════════════════════════════════════════════════════════════════════
# GRAPH BUILDER
# ═══════════════════════════════════════════════════════════════════════


def build_graph() -> StateGraph:
    """
    Construct the LangGraph StateGraph with 5 nodes and conditional edges.

    Returns a COMPILED graph ready for `await graph.ainvoke(state)`.

    WHY a factory function?  So the graph is constructed once at import
    time (or on first request) and reused.  The graph object itself is
    stateless — all state flows through the AgentState dict passed to ainvoke.
    """

    graph = StateGraph(AgentState)

    # ── Add nodes ──────────────────────────────────────────────
    graph.add_node("query_analyzer", query_analyzer_node)
    graph.add_node("retriever", retriever_node)
    graph.add_node("relevance_grader", relevance_grader_node)
    graph.add_node("generator", generator_node)
    graph.add_node("hallucination_checker", hallucination_checker_node)

    # ── Set entry point ────────────────────────────────────────
    graph.set_entry_point("query_analyzer")

    # ── Add edges ──────────────────────────────────────────────
    # Linear edges (always follow this path)
    graph.add_edge("query_analyzer", "retriever")
    graph.add_edge("retriever", "relevance_grader")

    # Conditional edge: grader decides whether to retry or proceed
    # WHY conditional?  This is the self-correction loop.  If the grader
    # finds too few relevant chunks, it rewrites the query and sends it
    # back to the retriever.  LangGraph handles this cleanly as a
    # conditional edge rather than requiring messy loop logic in the node.
    graph.add_conditional_edges(
        "relevance_grader",
        _should_retry_retrieval,
        {
            "retriever": "retriever",   # Loop back for retry
            "generator": "generator",   # Proceed to answer generation
        },
    )

    # Linear edges (post-generation)
    graph.add_edge("generator", "hallucination_checker")
    graph.add_edge("hallucination_checker", END)

    # ── Compile and return ─────────────────────────────────────
    # WHY compile?  Compilation validates the graph structure (no dangling
    # nodes, no unreachable states) and optimises the execution path.
    # It must be called before ainvoke.
    return graph.compile()
