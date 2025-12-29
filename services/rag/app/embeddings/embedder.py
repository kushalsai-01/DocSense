from __future__ import annotations

import hashlib


class PlaceholderEmbedder:
    """Deterministic placeholder embeddings.

    This is intentionally *not* a real model.
    It exists to keep architecture clean while allowing Qdrant integration.
    """

    def __init__(self, vector_size: int = 384):
        if vector_size <= 0:
            raise ValueError("vector_size must be > 0")
        self._size = vector_size

    @property
    def vector_size(self) -> int:
        return self._size

    def embed_text(self, text: str) -> list[float]:
        # Hash text to bytes and expand deterministically to floats in [-1, 1].
        h = hashlib.sha256(text.encode("utf-8")).digest()
        out: list[float] = []
        i = 0
        while len(out) < self._size:
            b = h[i % len(h)]
            out.append((b / 255.0) * 2.0 - 1.0)
            i += 1
        return out

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_text(t) for t in texts]
