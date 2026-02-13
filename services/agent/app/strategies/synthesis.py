from __future__ import annotations
from app.core.logging import get_logger
logger = get_logger(__name__)
class SynthesisStrategy:
    SYNTHESIS_PROMPT = """You are synthesizing information to answer a complex question.
Original Question: "{query}"
Information Sources:
{sources}
Instructions:
1. Combine all relevant information into a comprehensive answer
2. Remove duplicate information
3. Maintain logical flow and coherence
4. Note any contradictions between sources
5. Cite source numbers [1], [2], etc. when referencing specific information
6. If some parts of the question can't be answered from the sources, say so
Provide a well-structured, grounded answer:"""
    def __init__(self, llm_provider):
        self._llm = llm_provider
    async def synthesize(
        self,
        query: str,
        results: list[dict],
        strategy: str = "merge",
    ) -> str:
        if not results:
            return "No information was found in the documents to answer this question."
        if len(results) == 1:
            return results[0].get("answer", "")
        if strategy == "concatenate":
            return self._concatenate(results)
        return await self._merge(query, results)
    def _concatenate(self, results: list[dict]) -> str:
        parts = []
        for i, r in enumerate(results, 1):
            q = r.get("question", f"Source {i}")
            a = r.get("answer", "")
            if a:
                parts.append(f"**{q}**\n{a}")
        return "\n\n---\n\n".join(parts)
    async def _merge(self, query: str, results: list[dict]) -> str:
        sources_text = ""
        for i, r in enumerate(results, 1):
            q = r.get("question", f"Source {i}")
            a = r.get("answer", "No answer")
            sources_text += f"\n[Source {i}] Query: {q}\nAnswer: {a}\n"
        prompt = self.SYNTHESIS_PROMPT.format(query=query, sources=sources_text)
        try:
            answer = await self._llm.agenerate(prompt, max_tokens=1500, temperature=0.1)
            return answer.strip()
        except Exception as exc:
            logger.warning("synthesis_merge_fallback", error=str(exc))
            return self._concatenate(results)
