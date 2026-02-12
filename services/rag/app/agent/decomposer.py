"""
Query decomposition for breaking complex questions into simpler sub-queries.
Enables multi-step reasoning and better retrieval for complex questions.
"""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field
import json


class SubQuery(BaseModel):
    """Represents a decomposed sub-question."""
    question: str = Field(..., description="The sub-question to answer")
    priority: int = Field(..., ge=1, le=5, description="Priority level (1=low, 5=high)")
    reasoning: str = Field(default="", description="Why this sub-query is needed")


class QueryDecomposer:
    """
    Decomposes complex queries into simpler sub-queries.
    Uses LLM to intelligently break down multi-part questions.
    """
    
    def __init__(self, llm_generator):
        self.llm = llm_generator
    
    async def should_decompose(self, query: str) -> bool:
        """
        Determine if a query is complex enough to warrant decomposition.
        
        Heuristics:
        - Multiple questions in one query
        - Contains comparative language
        - Requires synthesis of multiple pieces of information
        """
        complexity_indicators = [
            "compare", "contrast", "difference between",
            "all", "both", "each", "every",
            "and", "also", "as well as",
            "?", "how many", "list"
        ]
        
        query_lower = query.lower()
        
        # Count indicators
        indicator_count = sum(1 for ind in complexity_indicators if ind in query_lower)
        
        # Multiple sentences or questions
        has_multiple_questions = query.count("?") > 1 or query.count(".") > 1
        
        return indicator_count >= 2 or has_multiple_questions
    
    async def decompose(self, query: str, max_sub_queries: int = 5) -> List[SubQuery]:
        """
        Break down a complex query into simpler sub-queries.
        
        Args:
            query: The complex query to decompose
            max_sub_queries: Maximum number of sub-queries to generate
        
        Returns:
            List of SubQuery objects
        """
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
            
            # Parse JSON response
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            sub_queries_data = json.loads(response_text)
            
            # Validate and create SubQuery objects
            sub_queries = []
            for sq in sub_queries_data[:max_sub_queries]:
                sub_queries.append(SubQuery(**sq))
            
            return sub_queries
            
        except Exception as e:
            # Fallback: return original query as single sub-query
            return [SubQuery(
                question=query,
                priority=5,
                reasoning="Failed to decompose, using original query"
            )]
    
    def create_synthesis_prompt(self, original_query: str, sub_results: List[Dict]) -> str:
        """
        Create prompt to synthesize answers from sub-queries into final answer.
        
        Args:
            original_query: The original complex question
            sub_results: List of {question, answer, citations} for each sub-query
        
        Returns:
            Prompt for final synthesis
        """
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
    """
    Expands queries with related terms and synonyms to improve retrieval.
    """
    
    def __init__(self, llm_generator):
        self.llm = llm_generator
    
    async def expand(self, query: str, max_variations: int = 3) -> List[str]:
        """
        Generate query variations to improve retrieval coverage.
        
        Args:
            query: Original query
            max_variations: Number of variations to generate
        
        Returns:
            List of query variations including original
        """
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
            
            # Always include original query
            return [query] + variations[:max_variations]
            
        except Exception:
            # Fallback: return original query only
            return [query]
