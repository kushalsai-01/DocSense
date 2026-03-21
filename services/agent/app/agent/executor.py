"""LangGraph-backed executor compatibility layer.

WHY this file still exists:
The original service imported AgentExecutor from executor.py.
The new architecture moved orchestration into graph.py (LangGraph StateGraph).
This wrapper preserves that public API while routing execution through the graph.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agent.graph import build_graph


@dataclass
class AgentStep:
    """Structured trace entry generated from final graph state."""

    step_number: int
    phase: str
    content: str
    duration_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Serialize step to API-friendly dict."""
        return {
            "step": self.step_number,
            "phase": self.phase,
            "content": self.content,
            "duration_ms": self.duration_ms,
        }


@dataclass
class AgentState:
    """Executor output contract retained for backward compatibility."""

    query: str
    steps: list[AgentStep] = field(default_factory=list)
    final_answer: str = ""
    citations: list[dict[str, Any]] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    status: str = "pending"
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize state for logging and tests."""
        return {
            "query": self.query,
            "steps": [s.to_dict() for s in self.steps],
            "final_answer": self.final_answer,
            "citations": self.citations,
            "suggestions": self.suggestions,
            "status": self.status,
            "error": self.error,
        }


class AgentExecutor:
    """Execute agent requests using the compiled LangGraph pipeline."""

    def __init__(self, llm_provider=None, tools=None, planner=None, evaluator=None):
        """Initialize and compile graph once for reuse across invocations."""
        self._graph = build_graph()

    async def execute(
        self,
        query: str,
        conversation_context: str | None = None,
        session_id: str | None = None,
        workspace_id: str | None = None,
    ) -> AgentState:
        """Run LangGraph and map final state into legacy AgentState model."""
        state = AgentState(query=query, status="running")

        try:
            result = await self._graph.ainvoke(
                {
                    "query": query,
                    "workspace_id": workspace_id or "",
                    "session_id": session_id or "",
                    "retry_count": 0,
                }
            )

            state.final_answer = result.get("answer", "")
            state.citations = result.get("citations", [])
            state.suggestions = result.get("suggestions", [])
            state.status = "completed" if not result.get("error") else "failed"
            state.error = result.get("error")

            state.steps = [
                AgentStep(
                    step_number=1,
                    phase="analyze",
                    content=f"query_type={result.get('query_type', 'factual')}",
                ),
                AgentStep(
                    step_number=2,
                    phase="retrieve",
                    content=f"retrieved={len(result.get('retrieved_chunks', []))}",
                ),
                AgentStep(
                    step_number=3,
                    phase="grade",
                    content=(
                        f"graded={len(result.get('graded_chunks', []))}, "
                        f"retries={result.get('retry_count', 0)}"
                    ),
                ),
                AgentStep(
                    step_number=4,
                    phase="generate",
                    content=f"answer_len={len(state.final_answer)}",
                ),
                AgentStep(
                    step_number=5,
                    phase="verify",
                    content=(
                        "hallucination_safe="
                        f"{result.get('hallucination_safe', False)}"
                    ),
                ),
            ]

        except Exception as exc:
            state.status = "failed"
            state.error = str(exc)
            state.final_answer = (
                "I encountered an error while processing your query. "
                "Please try again."
            )

        return state
