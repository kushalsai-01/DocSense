from __future__ import annotations
from dataclasses import dataclass
from app.retriever.qdrant_retriever import RetrievedChunk
@dataclass
class ContextBudget:
    max_tokens: int
    reserved_for_prompt: int = 500
    reserved_for_response: int = 1000
    average_chars_per_token: float = 4.0
    def estimate_tokens(self, text: str) -> int:
        return int(len(text) / self.average_chars_per_token)
    def get_available_budget(self) -> int:
        return self.max_tokens - self.reserved_for_prompt - self.reserved_for_response
    def select_chunks(
        self, chunks: list[RetrievedChunk], max_chunks: int | None = None
    ) -> list[RetrievedChunk]:
        available = self.get_available_budget()
        if available <= 0:
            return []
        selected: list[RetrievedChunk] = []
        total_tokens = 0
        sorted_chunks = sorted(chunks, key=lambda c: c.score, reverse=True)
        if max_chunks is not None:
            sorted_chunks = sorted_chunks[:max_chunks]
        for chunk in sorted_chunks:
            if not chunk.text:
                continue
            chunk_tokens = self.estimate_tokens(chunk.text)
            if total_tokens + chunk_tokens <= available:
                selected.append(chunk)
                total_tokens += chunk_tokens
            else:
                if not selected:
                    trimmed_text = self._trim_to_fit(chunk.text, available)
                    if trimmed_text:
                        trimmed_chunk = RetrievedChunk(
                            id=chunk.id,
                            score=chunk.score,
                            document_id=chunk.document_id,
                            text=trimmed_text,
                            chunk_index=chunk.chunk_index,
                        )
                        selected.append(trimmed_chunk)
                break
        return selected
    def _trim_to_fit(self, text: str, max_tokens: int) -> str | None:
        max_chars = int(max_tokens * self.average_chars_per_token)
        if len(text) <= max_chars:
            return text
        if max_chars < 100:
            return text[:max_chars] + "..."
        prefix_chars = max_chars // 2
        suffix_chars = max_chars - prefix_chars - 10
        return text[:prefix_chars] + "..." + text[-suffix_chars:]
    def build_context_string(self, chunks: list[RetrievedChunk]) -> str:
        if not chunks:
            return ""
        parts = []
        for i, chunk in enumerate(chunks, 1):
            if chunk.text:
                parts.append(f"[Document {i}]\n{chunk.text}\n")
        return "\n---\n".join(parts)
