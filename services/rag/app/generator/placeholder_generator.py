from __future__ import annotations

from dataclasses import dataclass

from app.retriever.qdrant_retriever import RetrievedChunk


@dataclass(frozen=True)
class GeneratedAnswer:
    answer: str


class PlaceholderGenerator:
    """Placeholder answer generator.

    No model API keys. This intentionally avoids any LLM integration.
    """

    def generate(self, question: str, context: list[RetrievedChunk]) -> GeneratedAnswer:
        if not context:
            return GeneratedAnswer(answer="No relevant chunks found (placeholder).")

        top = context[0]
        snippet = (top.text or "").strip()
        if len(snippet) > 240:
            snippet = snippet[:240] + "…"

        return GeneratedAnswer(
            answer=(
                "Placeholder answer. Top match snippet:\n"
                f"- score={top.score:.4f}\n"
                f"- document_id={top.document_id}\n"
                f"- text={snippet}"
            )
        )
