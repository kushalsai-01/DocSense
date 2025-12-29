from __future__ import annotations

from app.generator.placeholder_generator import PlaceholderGenerator
from app.retriever.qdrant_retriever import RetrievedChunk


def test_placeholder_generator_empty_context():
    gen = PlaceholderGenerator()
    out = gen.generate("q", [])
    assert "No relevant chunks" in out.answer


def test_placeholder_generator_uses_top_match_snippet():
    gen = PlaceholderGenerator()
    ctx = [
        RetrievedChunk(
            id="1",
            score=0.42,
            document_id="doc",
            text="some relevant text",
        )
    ]
    out = gen.generate("question", ctx)
    assert "Placeholder answer" in out.answer
    assert "document_id=doc" in out.answer
    assert "some relevant text" in out.answer
