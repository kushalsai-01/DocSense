from __future__ import annotations

import pytest

from app.embeddings.embedder import PlaceholderEmbedder


def test_placeholder_embedder_vector_size_and_range():
    emb = PlaceholderEmbedder(vector_size=8)
    v = emb.embed_text("hello")
    assert len(v) == 8
    assert all(-1.0 <= x <= 1.0 for x in v)


def test_placeholder_embedder_is_deterministic():
    emb = PlaceholderEmbedder(vector_size=16)
    assert emb.embed_text("same") == emb.embed_text("same")


def test_placeholder_embedder_rejects_invalid_size():
    with pytest.raises(ValueError):
        PlaceholderEmbedder(vector_size=0)
