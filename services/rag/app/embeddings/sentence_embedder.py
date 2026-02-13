from __future__ import annotations
from sentence_transformers import SentenceTransformer
from app.core.settings import settings
class SentenceEmbedder:
    _model: SentenceTransformer | None = None
    def __init__(self):
        self._model_name = settings.embedding_model
    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer(self._model_name)
        return self._model
    @property
    def vector_size(self) -> int:
        if self._model is None:
            temp_model = SentenceTransformer(self._model_name)
            dim = temp_model.get_sentence_embedding_dimension()
            del temp_model
            return dim
        return self.model.get_sentence_embedding_dimension()
    def embed_text(self, text: str) -> list[float]:
        embedding = self.model.encode(text, normalize_embeddings=True)
        return embedding.tolist()
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        embeddings = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.tolist()
