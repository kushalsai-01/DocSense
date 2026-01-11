from __future__ import annotations

from sentence_transformers import SentenceTransformer

from app.core.settings import settings


class SentenceEmbedder:
    """Production-grade embedder using Sentence Transformers.

    Uses a pre-trained model for semantic embeddings.
    Model is loaded lazily on first use and cached.
    """

    _model: SentenceTransformer | None = None

    def __init__(self):
        self._model_name = settings.embedding_model

    @property
    def model(self) -> SentenceTransformer:
        """Lazy-load the model on first access."""
        if self._model is None:
            self._model = SentenceTransformer(self._model_name)
        return self._model

    @property
    def vector_size(self) -> int:
        """Return the vector dimension for this model."""
        # Get dimension from the model
        if self._model is None:
            # Load model temporarily to get dimension
            temp_model = SentenceTransformer(self._model_name)
            dim = temp_model.get_sentence_embedding_dimension()
            del temp_model
            return dim
        return self.model.get_sentence_embedding_dimension()

    def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text string."""
        embedding = self.model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Batch embed multiple texts efficiently."""
        if not texts:
            return []
        embeddings = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.tolist()
