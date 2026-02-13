from __future__ import annotations
import json
from app.core.logging import get_logger
logger = get_logger(__name__)
class Evaluator:
    EVAL_PROMPT = """You are evaluating the quality of an AI-generated answer to a user's question.
Question: "{query}"
Answer: "{answer}"
Number of citations: {citation_count}
Rate the answer quality and provide brief reasoning.
Respond with JSON:
{{
  "quality": "good" | "acceptable" | "poor",
  "groundedness": "high" | "medium" | "low",
  "completeness": "complete" | "partial" | "insufficient",
  "coherence": "clear" | "adequate" | "unclear",
  "reasoning": "<brief explanation>"
}}
Return ONLY valid JSON."""
    
    def __init__(self, llm_router):
        self.llm_router = llm_router
    
    async def evaluate(self, query: str, answer: str, citation_count: int) -> dict:
        prompt = self.EVAL_PROMPT.format(
            query=query,
            answer=answer[:500],
            citation_count=citation_count
        )
        
        try:
            response = await self.llm_router.agenerate(prompt, max_tokens=300, temperature=0.1)
            response_text = response.strip()
            
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            evaluation = json.loads(response_text)
            logger.info(
                "evaluation_complete",
                quality=evaluation.get("quality"),
                groundedness=evaluation.get("groundedness")
            )
            return evaluation
            
        except Exception as exc:
            logger.warning("evaluation_failed", error=str(exc))
            return {
                "quality": "acceptable",
                "groundedness": "medium",
                "completeness": "partial",
                "coherence": "adequate",
                "reasoning": "Evaluation failed; default metrics applied"
            }