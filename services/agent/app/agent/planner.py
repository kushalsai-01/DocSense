from __future__ import annotations
import json
from typing import Any
from app.core.config import settings
from app.core.logging import get_logger
logger = get_logger(__name__)
class QueryPlan:
    def __init__(
        self,
        original_query: str,
        strategy: str,
        steps: list[dict],
        reasoning: str,
    ):
        self.original_query = original_query
        self.strategy = strategy
        self.steps = steps
        self.reasoning = reasoning
    def to_dict(self) -> dict:
        return {
            "original_query": self.original_query,
            "strategy": self.strategy,
            "steps": self.steps,
            "reasoning": self.reasoning,
        }
class Planner:
    PLANNING_PROMPT = """You are a query planning agent for a document intelligence system.
Analyze the user's query and create an execution plan.
Available tools:
- search: Vector search across documents. Best for factual lookups.
- compare: Compare information from multiple searches. Best for "compare X vs Y" queries.
- summarize: Get comprehensive overview with more context. Best for "summarize", "overview", "explain" queries.
- extract: Pull specific data points from documents. Best for "list all", "what are the", "extract" queries.
Available strategies:
- direct: Single tool call sufficient (simple questions)
- decompose: Break into sub-questions, execute each, then synthesize
- compare: Side-by-side comparison of multiple topics
- summarize: Broad retrieval + synthesis for overview questions
- extract: Targeted extraction of specific information
User Query: "{query}"
Conversation Context (if any): {context}
Respond with a JSON object:
{{
  "strategy": "<strategy_name>",
  "reasoning": "<brief explanation of why this strategy>",
  "steps": [
    {{
      "tool": "<tool_name>",
      "query": "<specific query for this step>",
      "params": {{}}
    }}
  ]
}}
Return ONLY valid JSON. No markdown, no explanation outside the JSON."""
    
    def __init__(self, llm_router):
        self.llm_router = llm_router
    
    async def plan(self, query: str, conversation_context: str = "") -> QueryPlan:
        logger.info("planning_query", query=query[:100])
        plan = self._heuristic_plan(query)
        if plan is not None:
            logger.info("plan_heuristic", strategy=plan.strategy)
            return plan
        try:
            plan = await self._llm_plan(query, conversation_context)
            logger.info("plan_llm", strategy=plan.strategy, steps=len(plan.steps))
            return plan
        except Exception as exc:
            logger.warning("plan_fallback", error=str(exc))
            return self._fallback_plan(query)
    def _heuristic_plan(self, query: str) -> QueryPlan | None:
        q_lower = query.lower().strip()
        compare_patterns = ["compare", "difference between", "vs ", "versus", "contrast"]
        if any(p in q_lower for p in compare_patterns):
            return QueryPlan(
                original_query=query,
                strategy="compare",
                steps=[{"tool": "compare", "query": query, "params": {"top_k": 3}}],
                reasoning="Query contains comparison language — using compare tool",
            )
        summary_patterns = ["summarize", "summary", "overview", "explain", "describe"]
        if any(q_lower.startswith(p) or f" {p}" in q_lower for p in summary_patterns):
            return QueryPlan(
                original_query=query,
                strategy="summarize",
                steps=[{"tool": "summarize", "query": query, "params": {"top_k": 8}}],
                reasoning="Query requests a summary/overview — using summarize tool with broader context",
            )
        extract_patterns = ["extract", "list all", "list the", "what are the", "find all"]
        if any(q_lower.startswith(p) or f" {p}" in q_lower for p in extract_patterns):
            return QueryPlan(
                original_query=query,
                strategy="extract",
                steps=[{"tool": "extract", "query": query, "params": {}}],
                reasoning="Query requests extraction of specific information",
            )
        word_count = len(query.split())
        question_marks = query.count("?")
        if word_count <= 12 and question_marks <= 1:
            return QueryPlan(
                original_query=query,
                strategy="direct",
                steps=[{"tool": "search", "query": query, "params": {"top_k": 5}}],
                reasoning="Simple factual question — direct search",
            )
        return None
    async def _llm_plan(self, query: str, context: str | None) -> QueryPlan:
        prompt = self.PLANNING_PROMPT.format(
            query=query,
            context=context or "No prior conversation",
        )
        response = await self.llm_router.agenerate(prompt, max_tokens=600, temperature=0.1)
        response_text = response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        plan_data = json.loads(response_text)
        return QueryPlan(
            original_query=query,
            strategy=plan_data.get("strategy", "direct"),
            steps=plan_data.get("steps", [{"tool": "search", "query": query, "params": {}}]),
            reasoning=plan_data.get("reasoning", "LLM-generated plan"),
        )
    def _fallback_plan(self, query: str) -> QueryPlan:
        return QueryPlan(
            original_query=query,
            strategy="direct",
            steps=[{"tool": "search", "query": query, "params": {"top_k": 5}}],
            reasoning="Fallback: direct search (planning failed)",
        )