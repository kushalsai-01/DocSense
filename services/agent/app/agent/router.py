from __future__ import annotations
from app.core.config import settings
from app.core.logging import get_logger
logger = get_logger(__name__)
class LLMRouter:
    def __init__(self):
        self._provider = None
        self._provider_name = settings.llm_provider
        self._init_provider()
    def _init_provider(self):
        if self._provider_name == "openai":
            self._init_openai()
        elif self._provider_name == "gemini":
            self._init_gemini()
        else:
            logger.warning("no_llm_configured", provider=self._provider_name)
    def _init_openai(self):
        try:
            from openai import AsyncOpenAI
            api_key = settings.openai_api_key
            if not api_key:
                logger.warning("openai_no_api_key")
                return
            kwargs = {"api_key": api_key}
            if settings.openai_base_url:
                kwargs["base_url"] = settings.openai_base_url
            self._provider = AsyncOpenAI(**kwargs)
            self._model = settings.openai_model
            logger.info("llm_initialized", provider="openai", model=self._model)
        except ImportError:
            logger.error("openai_package_missing")
    def _init_gemini(self):
        try:
            import google.generativeai as genai
            api_key = settings.gemini_api_key
            if not api_key:
                logger.warning("gemini_no_api_key")
                return
            genai.configure(api_key=api_key)
            self._provider = genai.GenerativeModel(settings.gemini_model)
            self._model = settings.gemini_model
            logger.info("llm_initialized", provider="gemini", model=self._model)
        except ImportError:
            logger.error("gemini_package_missing")
    async def agenerate(
        self,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.0,
        system_prompt: str | None = None,
    ) -> str:
        if self._provider is None:
            return self._fallback_response(prompt)
        try:
            if self._provider_name == "openai":
                return await self._openai_generate(prompt, max_tokens, temperature, system_prompt)
            elif self._provider_name == "gemini":
                return await self._gemini_generate(prompt, max_tokens, temperature, system_prompt)
            else:
                return self._fallback_response(prompt)
        except Exception as exc:
            logger.error("llm_generation_failed", error=str(exc))
            return self._fallback_response(prompt)
    async def _openai_generate(
        self, prompt: str, max_tokens: int, temperature: float, system_prompt: str | None
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        response = await self._provider.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""
    async def _gemini_generate(
        self, prompt: str, max_tokens: int, temperature: float, system_prompt: str | None
    ) -> str:
        import asyncio
        combined = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._provider.generate_content(
                combined,
                generation_config={"max_output_tokens": max_tokens, "temperature": temperature},
            ),
        )
        return response.text
    def _fallback_response(self, prompt: str) -> str:
        return (
            "LLM is not configured. Set OPENAI_API_KEY or GEMINI_API_KEY "
            "to enable agent reasoning. The system will use direct RAG retrieval."
        )
    @property
    def is_available(self) -> bool:
        return self._provider is not None