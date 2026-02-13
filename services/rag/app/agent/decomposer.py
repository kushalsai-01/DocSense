from typing import List, Dict, Optional
from pydantic import BaseModel, Field
import json
class SubQuery(BaseModel):
    question: str = Field(..., description="The sub-question to answer")
    priority: int = Field(..., ge=1, le=5, description="Priority level (1=low, 5=high)")
    reasoning: str = Field(default="", description="Why this sub-query is needed")
class QueryDecomposer:
    def __init__(self, llm_generator):
        self.llm = llm_generator
    async def should_decompose(self, query: str) -> bool:
        complexity_indicators = [
            "compare", "contrast", "difference between",
            "all", "both", "each", "every",
            "and", "also", "as well as",
            "?", "how many", "list"
        ]
        query_lower = query.lower()
        indicator_count = sum(1 for ind in complexity_indicators if ind in query_lower)
        has_multiple_questions = query.count("?") > 1 or query.count(".") > 1
        return indicator_count >= 2 or has_multiple_questions
    async def decompose(self, query: str, max_sub_queries: int = 5) -> List[SubQuery]:
        prompt = f"""You are an expert at breaking down complex questions into simpler sub-questions.
Complex Question: "{query}"
Break this into 2-{max_sub_queries} simpler sub-questions that, when answered together, would fully answer the original question.
For each sub-question, provide:
1. question: A clear, focused sub-question
2. priority: 1-5 (5 = must answer first, 1 = optional context)
3. reasoning: Brief explanation of why this sub-question is needed
Return as JSON array:
[
  {{
    "question": "...",
    "priority": 5,
    "reasoning": "..."
  }}
]
Return ONLY the JSON array, no other text."""
        try:
            response = await self.llm.generate(
                query=prompt,
                max_tokens=800,
                temperature=0.3
            )
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            sub_queries_data = json.loads(response_text)
            sub_queries = []
            for sq in sub_queries_data[:max_sub_queries]:
                sub_queries.append(SubQuery(**sq))
            return sub_queries
        except Exception as e:
            return [SubQuery(
                question=query,
                priority=5,
                reasoning="Failed to decompose, using original query"
            )]
    def create_synthesis_prompt(self, original_query: str, sub_results: List[Dict]) -> str:
        sub_answers = "\n\n".join([
            f"Sub-question {i+1}: {result['question']}\nAnswer: {result['answer']}"
            for i, result in enumerate(sub_results)
        ])
        prompt = f"""You are synthesizing multiple answers into one comprehensive response.
Original Question: "{original_query}"
Sub-questions and their answers:
{sub_answers}
Task: Create a comprehensive answer to the original question by combining and synthesizing the information from the sub-question answers above.
Requirements:
- Address the original question completely
- Integrate information from all relevant sub-answers
- Be coherent and well-structured
- Don't repeat the sub-questions in your answer
Final Answer:"""
        return prompt

class QueryExpander:
    def __init__(self, llm_generator):
        self.llm = llm_generator
    
    async def expand_query(self, query: str, max_variations: int = 3) -> List[str]:
        prompt = f"""Generate {max_variations} alternative phrasings of this query that capture the same intent:
Original: "{query}"
Return as JSON array of strings:
["variation 1", "variation 2", "variation 3"]
Make variations that:
- Use synonyms and related terms
- Rephrase but keep same meaning
- Would retrieve similar documents
Return ONLY the JSON array."""
        try:
            response = await self.llm.generate(
                query=prompt,
                max_tokens=300,
                temperature=0.5
            )
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            variations = json.loads(response_text)
            return [query] + variations[:max_variations]
        except Exception:
            return [query]
