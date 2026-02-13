from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal
from app.agent.planner import Planner, QueryPlan
from app.agent.tools import AgentTools, ToolResult
from app.agent.evaluator import Evaluator
from app.core.config import settings
from app.core.logging import get_logger
logger = get_logger(__name__)
@dataclass
class AgentStep:
    step_number: int
    phase: str
    content: str
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_output: dict | str | None = None
    duration_ms: int = 0
    timestamp: float = field(default_factory=time.time)
    def to_dict(self) -> dict:
        return {
            "step": self.step_number,
            "phase": self.phase,
            "content": self.content,
            "tool": self.tool_name,
            "tool_input": self.tool_input,
            "tool_output": self.tool_output if isinstance(self.tool_output, (dict, str, type(None))) else str(self.tool_output),
            "duration_ms": self.duration_ms,
        }
@dataclass
class AgentState:
    query: str
    plan: QueryPlan | None = None
    steps: list[AgentStep] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    intermediate_answers: list[str] = field(default_factory=list)
    final_answer: str = ""
    citations: list[dict] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    status: str = "pending" 
    error: str | None = None
    total_duration_ms: int = 0
    def add_step(self, phase: str, content: str, **kwargs) -> AgentStep:
        step = AgentStep(
            step_number=len(self.steps) + 1,
            phase=phase,
            content=content,
            **kwargs,
        )
        self.steps.append(step)
        return step
    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "plan": self.plan.to_dict() if self.plan else None,
            "steps": [s.to_dict() for s in self.steps],
            "final_answer": self.final_answer,
            "citations": self.citations,
            "suggestions": self.suggestions,
            "status": self.status,
            "error": self.error,
            "total_duration_ms": self.total_duration_ms,
        }
class AgentExecutor:
    def __init__(
        self,
        llm_provider,
        tools: AgentTools | None = None,
        planner: Planner | None = None,
        evaluator: Evaluator | None = None,
    ):
        self._llm = llm_provider
        self._tools = tools or AgentTools()
        self._planner = planner or Planner(llm_provider)
        self._evaluator = evaluator or Evaluator(llm_provider)
    async def execute(
        self,
        query: str,
        conversation_context: str | None = None,
        session_id: str | None = None,
    ) -> AgentState:
        start_time = time.time()
        state = AgentState(query=query, status="running")
        try:
            plan_start = time.time()
            state.plan = await self._planner.plan(query, conversation_context)
            state.add_step(
                phase="plan",
                content=f"Strategy: {state.plan.strategy}. Reasoning: {state.plan.reasoning}",
                duration_ms=int((time.time() - plan_start) * 1000),
            )
            for i, step_def in enumerate(state.plan.steps):
                if len(state.steps) >= settings.max_reasoning_steps:
                    state.add_step(phase="observe", content="Max reasoning steps reached — synthesizing with available results")
                    break
                tool_name = step_def.get("tool", "search")
                tool_query = step_def.get("query", query)
                tool_params = step_def.get("params", {})
                state.add_step(
                    phase="think",
                    content=f"Executing step {i+1}/{len(state.plan.steps)}: {tool_name}({tool_query[:80]}...)",
                )
                act_start = time.time()
                result = await self._execute_tool(tool_name, tool_query, tool_params)
                state.tool_results.append(result)
                act_duration = int((time.time() - act_start) * 1000)
                state.add_step(
                    phase="act",
                    content=f"Tool '{tool_name}' completed (success={result.success})",
                    tool_name=tool_name,
                    tool_input={"query": tool_query, **tool_params},
                    tool_output=result.data if result.success else result.error,
                    duration_ms=act_duration,
                )
                if result.success:
                    answer = self._extract_answer(result)
                    if answer:
                        state.intermediate_answers.append(answer)
                        state.add_step(
                            phase="observe",
                            content=f"Got answer ({len(answer)} chars) with {len(self._extract_citations(result))} citations",
                        )
                else:
                    state.add_step(
                        phase="observe",
                        content=f"Tool failed: {result.error}",
                    )
            synth_start = time.time()
            state.final_answer = await self._synthesize(state, conversation_context)
            state.citations = self._collect_all_citations(state)
            state.add_step(
                phase="synthesize",
                content=f"Synthesized final answer from {len(state.tool_results)} tool results",
                duration_ms=int((time.time() - synth_start) * 1000),
            )
            if settings.enable_self_evaluation and state.final_answer:
                eval_start = time.time()
                evaluation = await self._evaluator.evaluate(
                    query=query,
                    answer=state.final_answer,
                    citations=state.citations,
                )
                state.add_step(
                    phase="evaluate",
                    content=f"Quality: {evaluation.get('quality', 'unknown')} — {evaluation.get('reasoning', '')}",
                    duration_ms=int((time.time() - eval_start) * 1000),
                )
                if evaluation.get("quality") == "poor" and len(state.steps) < settings.max_reasoning_steps - 2:
                    state.add_step(phase="think", content="Answer quality rated poor — attempting broader search")
                    retry_result = await self._tools.summarize(query, top_k=10)
                    if retry_result.success:
                        state.tool_results.append(retry_result)
                        broader_answer = self._extract_answer(retry_result)
                        if broader_answer and len(broader_answer) > len(state.final_answer):
                            state.final_answer = broader_answer
                            state.citations = self._collect_all_citations(state)
                            state.add_step(phase="observe", content="Improved answer with broader retrieval")
            state.suggestions = await self._generate_suggestions(query, state.final_answer)
            state.status = "completed"
        except Exception as exc:
            logger.error("agent_execution_failed", error=str(exc), query=query[:100])
            state.status = "failed"
            state.error = str(exc)
            state.add_step(phase="observe", content=f"Execution failed: {exc}")
            if not state.final_answer:
                state.final_answer = "I encountered an error while processing your query. Please try rephrasing or simplifying your question."
        state.total_duration_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "agent_execution_complete",
            status=state.status,
            steps=len(state.steps),
            duration_ms=state.total_duration_ms,
        )
        return state
    async def _execute_tool(self, tool_name: str, query: str, params: dict) -> ToolResult:
        match tool_name:
            case "search":
                return await self._tools.search(query, top_k=params.get("top_k", 5))
            case "compare":
                queries = params.get("queries", [query])
                return await self._tools.compare(queries, top_k=params.get("top_k", 3))
            case "summarize":
                return await self._tools.summarize(query, top_k=params.get("top_k", 8))
            case "extract":
                return await self._tools.extract(query, fields=params.get("fields"))
            case _:
                return await self._tools.search(query, top_k=params.get("top_k", 5))
    async def _synthesize(self, state: AgentState, conversation_context: str | None) -> str:
        if len(state.intermediate_answers) == 1:
            return state.intermediate_answers[0]
        if not state.intermediate_answers:
            return "I couldn't find sufficient information in the documents to answer your question."
        synthesis_prompt = self._build_synthesis_prompt(state, conversation_context)
        try:
            answer = await self._llm.agenerate(synthesis_prompt, max_tokens=2500, temperature=0.1)
            return answer.strip()
        except Exception as exc:
            logger.warning("synthesis_fallback", error=str(exc))
            return "\n\n".join(state.intermediate_answers)
    def _build_synthesis_prompt(self, state: AgentState, context: str | None) -> str:
        parts = [
            "You are an AI assistant synthesizing information from multiple sources to answer a user's question.",
            f"\nOriginal Question: {state.query}\n",
        ]
        if context:
            parts.append(f"Conversation Context:\n{context}\n")
        parts.append("Retrieved Information:")
        for i, answer in enumerate(state.intermediate_answers, 1):
            parts.append(f"\n--- Information {i} ---\n{answer}")
        parts.append(
            "\n\nProvide a comprehensive, well-structured answer that:\n"
            "1. Synthesizes ALL retrieved information into a coherent response\n"
            "2. DO NOT include references like 'Source 1' or 'Information 1' in your answer\n"
            "3. Present the information naturally as if it's your knowledge\n"
            "4. Use bullet points or sections for clarity when appropriate\n"
            "5. Be thorough and complete - include ALL relevant information\n"
            "6. If information seems incomplete, acknowledge it briefly\n"
            "7. Provide a professional, readable answer\n"
        )
        return "\n".join(parts)
    def _extract_answer(self, result: ToolResult) -> str:
        if isinstance(result.data, dict):
            return result.data.get("answer") or result.data.get("summary") or result.data.get("extracted") or ""
        if isinstance(result.data, str):
            return result.data
        if isinstance(result.data, list):
            parts = []
            for item in result.data:
                if isinstance(item, dict) and item.get("answer"):
                    parts.append(f"**{item.get('query', '')}**: {item['answer']}")
            return "\n\n".join(parts)
        return ""
    def _extract_citations(self, result: ToolResult) -> list[dict]:
        if isinstance(result.data, dict):
            return result.data.get("citations", [])
        if isinstance(result.data, list):
            citations = []
            for item in result.data:
                if isinstance(item, dict):
                    citations.extend(item.get("citations", []))
            return citations
        return []
    def _collect_all_citations(self, state: AgentState) -> list[dict]:
        seen_ids = set()
        citations = []
        for result in state.tool_results:
            for cit in self._extract_citations(result):
                cid = cit.get("chunk_id", "")
                if cid and cid not in seen_ids:
                    seen_ids.add(cid)
                    citations.append(cit)
        return citations
    async def _generate_suggestions(self, query: str, answer: str) -> list[str]:
        prompt = (
            f'Based on the question "{query}" and answer "{answer[:500]}", '
            f"suggest 3 concise follow-up questions (under 15 words each). "
            f'Return as JSON array: ["Q1?", "Q2?", "Q3?"]'
        )
        try:
            response = await self._llm.agenerate(prompt, max_tokens=300, temperature=0.7)
            text = response.strip()
            if "```" in text:
                text = text.split("```")[1].split("```")[0].replace("json", "").strip()
            return json.loads(text)[:3]
        except Exception:
            return [
                "Can you provide more details?",
                "What else should I know about this?",
                "How does this relate to other documents?",
            ]