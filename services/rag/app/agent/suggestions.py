from typing import List
import json
class SuggestionEngine:
    def __init__(self, llm_generator):
        self.llm = llm_generator
    async def generate_suggestions(
        self,
        current_query: str,
        answer: str,
        available_documents: List[str] = None,
        num_suggestions: int = 3
    ) -> List[str]:
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
                temperature=0.7
            )
            response_text = response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            suggestions = json.loads(response_text)
            return suggestions[:num_suggestions]
        except Exception as e:
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
