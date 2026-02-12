"""
Suggestion generator for proactive question recommendations.
Helps users discover relevant follow-up questions.
"""

from typing import List
import json


class SuggestionEngine:
    """
    Generates contextual follow-up question suggestions.
    Makes the system proactive and helps guide user exploration.
    """
    
    def __init__(self, llm_generator):
        self.llm = llm_generator
    
    async def generate_suggestions(
        self,
        current_query: str,
        answer: str,
        available_documents: List[str] = None,
        num_suggestions: int = 3
    ) -> List[str]:
        """
        Generate follow-up question suggestions based on current conversation.
        
        Args:
            current_query: The question user just asked
            answer: The answer that was provided
            available_documents: Optional list of document titles/names
            num_suggestions: Number of suggestions to generate
        
        Returns:
            List of suggested follow-up questions
        """
        doc_context = ""
        if available_documents:
            doc_context = f"\n\nAvailable documents: {', '.join(available_documents)}"
        
        prompt = f"""You are helping a user explore their documents through questions.

User just asked: "{current_query}"

Answer provided: "{answer}"{doc_context}

Generate {num_suggestions} smart follow-up questions the user might want to ask next.

Guidelines:
- Questions should be natural extensions of the current topic
- Make questions specific and actionable
- Consider what details weren't fully covered
- Suggest different angles or related topics
- Keep questions concise (under 15 words)

Return as JSON array:
["Question 1?", "Question 2?", "Question 3?"]

Return ONLY the JSON array."""

        try:
            response = await self.llm.generate(
                query=prompt,
                max_tokens=400,
                temperature=0.7  # Higher temp for creative suggestions
            )
            
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            suggestions = json.loads(response_text)
            
            return suggestions[:num_suggestions]
            
        except Exception as e:
            # Fallback: return generic suggestions
            return [
                "Can you provide more details?",
                "What else should I know about this?",
                "How does this relate to other documents?"
            ][:num_suggestions]
    
    async def generate_document_suggestions(
        self,
        document_summary: str,
        num_suggestions: int = 5
    ) -> List[str]:
        """
        Generate suggested questions based on a document's content.
        Useful for first-time document exploration.
        
        Args:
            document_summary: Brief summary of the document
            num_suggestions: Number of suggestions to generate
        
        Returns:
            List of suggested questions about the document
        """
        prompt = f"""A user has uploaded a new document. Generate {num_suggestions} useful questions they could ask about it.

Document summary: {document_summary}

Generate questions that:
- Help explore key topics in the document
- Extract important information
- Understand context and relationships
- Range from broad overview to specific details

Return as JSON array of questions:
["Question 1?", "Question 2?", ...]

Return ONLY the JSON array."""

        try:
            response = await self.llm.generate(
                query=prompt,
                max_tokens=500,
                temperature=0.6
            )
            
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            suggestions = json.loads(response_text)
            
            return suggestions[:num_suggestions]
            
        except Exception:
            return [
                "What are the main topics covered?",
                "Can you summarize this document?",
                "What are the key points?",
                "What details are most important?",
                "How is this information organized?"
            ][:num_suggestions]
