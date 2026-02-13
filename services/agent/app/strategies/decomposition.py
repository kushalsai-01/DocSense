from __future__ import annotations
import json
from dataclasses import dataclass
from app.core.logging import get_logger
logger = get_logger(__name__)
@dataclass
class SubQuery:
    question: str
    priority: int
    reasoning: str
    depends_on: list[int] | None = None
    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "priority": self.priority,
            "reasoning": self.reasoning,
            "depends_on": self.depends_on,
        }
class DecompositionStrategy:
    DECOMPOSE_PROMPT = """Break down this complex question into simpler sub-questions.
Question: "{query}"
Rules:
- Generate 2-5 focused sub-questions
- Each should be independently answerable from a document search
- Assign priority (1=low, 5=critical)  
- If a sub-question depends on another's answer, note it
- Keep sub-questions specific and actionable
Return JSON array:
[
  {{"question": "...", "priority": 5, "reasoning": "...", "depends_on": null}},
  {{"question": "...", "priority": 3, "reasoning": "...", "depends_on": [0]}}
]
Return ONLY valid JSON array."""
    
    def __init__(self, llm_router):
        self.llm_router = llm_router
    
    def _should_decompose(self, query: str) -> bool:
        q_lower = query.lower()
        indicators = [
            "compare", "contrast", "difference between",
            "and also", "as well as", "in addition",
            "both", "each", "all of",
            "step by step", "how does", "why does",
        ]
        indicator_count = sum(1 for ind in indicators if ind in q_lower)
        has_multiple_questions = query.count("?") > 1
        is_long = len(query.split()) > 20
        return indicator_count >= 2 or has_multiple_questions or (is_long and indicator_count >= 1)
    async def decompose(self, query: str, max_sub_queries: int = 5) -> list[SubQuery]:
        prompt = self.DECOMPOSE_PROMPT.format(query=query)
        try:
            response = await self.llm_router.agenerate(prompt, max_tokens=800, temperature=0.2)
            text = response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            sub_queries_data = json.loads(text)
            sub_queries = []
            for sq in sub_queries_data[:max_sub_queries]:
                sub_queries.append(SubQuery(
                    question=sq.get("question", ""),
                    priority=min(max(sq.get("priority", 3), 1), 5),
                    reasoning=sq.get("reasoning", ""),
                    depends_on=sq.get("depends_on"),
                ))
            return self._topological_sort(sub_queries)
        except Exception as exc:
            logger.warning("decomposition_failed", error=str(exc))
            return [SubQuery(question=query, priority=5, reasoning="Decomposition failed — using original query")]
    def _topological_sort(self, sub_queries: list[SubQuery]) -> list[SubQuery]:
        independent = [sq for sq in sub_queries if not sq.depends_on]
        dependent = [sq for sq in sub_queries if sq.depends_on]
        independent.sort(key=lambda x: x.priority, reverse=True)
        dependent.sort(key=lambda x: x.priority, reverse=True)
        return independent + dependent
