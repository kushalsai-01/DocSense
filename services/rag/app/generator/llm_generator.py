from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.context_budget import ContextBudget
from app.core.settings import settings
from app.retriever.qdrant_retriever import RetrievedChunk


@dataclass(frozen=True)
class Citation:
    """Citation reference to a source chunk."""
    chunk_id: str
    document_id: str | None
    chunk_index: int | None
    text_snippet: str | None


@dataclass(frozen=True)
class GeneratedAnswer:
    answer: str
    citations: list[Citation]


class LLMProvider(Protocol):
    """Protocol for LLM providers (OpenAI, local, etc.)."""

    def generate(self, system_prompt: str, user_prompt: str, max_tokens: int) -> str:
        raise NotImplementedError


class OpenAIProvider:
    """OpenAI-compatible LLM provider."""

    def __init__(self):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai package is required for LLM generation")

        api_key = settings.openai_api_key
        base_url = settings.openai_base_url

        if not api_key and settings.llm_provider == "openai":
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")

        self.client = OpenAI(api_key=api_key, base_url=base_url) if api_key else None
        self.model = settings.openai_model

    def generate(self, system_prompt: str, user_prompt: str, max_tokens: int) -> str:
        if self.client is None:
            raise ValueError("OpenAI client not initialized")

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.0,  # Deterministic answers
        )
        return response.choices[0].message.content or ""


class GeminiProvider:
    """Google Gemini LLM provider."""

    def __init__(self):
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("google-generativeai package is required for Gemini generation")

        api_key = settings.gemini_api_key
        if not api_key and settings.llm_provider == "gemini":
            raise ValueError("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")

        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(settings.gemini_model)
        else:
            self.model = None

    def generate(self, system_prompt: str, user_prompt: str, max_tokens: int) -> str:
        if self.model is None:
            raise ValueError("Gemini model not initialized")

        # Gemini doesn't have separate system/user roles in the same way
        # We combine system prompt with user prompt
        combined_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        response = self.model.generate_content(
            combined_prompt,
            generation_config={
                "max_output_tokens": max_tokens,
                "temperature": 0.0,
            }
        )
        return response.text


class LLMGenerator:
    """Production-grade answer generator with citations.

    Uses an abstracted LLM provider interface for flexibility.
    Supports OpenAI and OpenAI-compatible APIs.
    """

    def __init__(self, provider: LLMProvider | None = None):
        if provider is not None:
            self._provider = provider
        elif settings.llm_provider == "openai":
            try:
                self._provider = OpenAIProvider()
            except (ValueError, ImportError):
                # Fall back to context-echo when no API key is available.
                self._provider = None
        elif settings.llm_provider == "gemini":
            try:
                self._provider = GeminiProvider()
            except (ValueError, ImportError):
                # Fall back to context-echo when no API key is available.
                self._provider = None
        else:
            self._provider = None

        # Initialize context budget manager
        self._context_budget = ContextBudget(
            max_tokens=settings.max_context_tokens,
            reserved_for_prompt=500,
            reserved_for_response=1000,
        )

    def generate(self, question: str, context: list[RetrievedChunk], conversation_context: str | None = None) -> GeneratedAnswer:
        """Generate an answer with citations from retrieved chunks.
        
        Args:
            question: User's question
            context: Retrieved chunks to use as context
            conversation_context: Optional conversation history for multi-turn dialogue

        Returns a GeneratedAnswer with:
        - Answer text (grounded in context)
        - Citations mapping answer claims to source chunks
        """
        if not context:
            return GeneratedAnswer(
                answer="I don't have sufficient information in my knowledge base to answer this question.",
                citations=[],
            )

        # Select chunks that fit within token budget
        selected_chunks = self._context_budget.select_chunks(
            context, max_chunks=settings.max_chunks
        )

        if not selected_chunks:
            return GeneratedAnswer(
                answer="I don't have sufficient information in my knowledge base to answer this question.",
                citations=[],
            )

        # Build context from selected chunks
        context_text = self._context_budget.build_context_string(selected_chunks)
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(question, context_text, conversation_context)

        # Generate answer — use LLM if available, else echo context
        if self._provider is not None:
            answer_text = self._provider.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=1000,
            )
        else:
            # Fallback: summarize retrieved context without LLM
            snippets = []
            for i, ch in enumerate(selected_chunks, 1):
                text = (ch.text or "").strip()
                if len(text) > 300:
                    text = text[:300] + "..."
                snippets.append(f"[{i}] {text}")
            answer_text = (
                "LLM is not configured (set OPENAI_API_KEY). "
                "Here are the most relevant passages from your documents:\n\n"
                + "\n\n".join(snippets)
            )

        # Extract citations from selected chunks
        citations = [
            Citation(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                chunk_index=chunk.chunk_index,
                text_snippet=chunk.text[:200] + "..." if chunk.text and len(chunk.text) > 200 else chunk.text,
            )
            for chunk in selected_chunks
        ]

        return GeneratedAnswer(answer=answer_text, citations=citations)

    def _build_system_prompt(self) -> str:
        return """You are a helpful assistant that answers questions based ONLY on the provided context.

Rules:
1. Answer ONLY using information from the provided context.
2. If the context doesn't contain enough information, say "I don't have sufficient information to answer this question."
3. Do not make up or hallucinate information.
4. Be precise and cite specific details from the context.
5. If the question cannot be answered from the context, politely decline."""

    def _build_user_prompt(self, question: str, context: str, conversation_context: str | None = None) -> str:
        prompt_parts = []
        
        # Add conversation history if available
        if conversation_context:
            prompt_parts.append(f"""Previous Conversation:
{conversation_context}

---

""")
        
        prompt_parts.append(f"""Context:
{context}

Question: {question}

Answer based ONLY on the context above:""")
        
        return "".join(prompt_parts)
