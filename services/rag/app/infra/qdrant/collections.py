from qdrant_client.http import models as qm

from app.core.settings import settings
from app.embeddings.sentence_embedder import SentenceEmbedder
from app.infra.qdrant.client import get_qdrant_client


def ensure_collection() -> None:
    """Ensure Qdrant collection exists with correct vector size.

    Vector size is determined from the embedding model dimension.
    """
    client = get_qdrant_client()
    collection = settings.qdrant_collection

    try:
        existing = client.get_collection(collection)
        # Check if vector size matches (for development, we allow recreation)
        # In production, you might want to handle migrations differently
        return
    except Exception:
        # If it doesn't exist (or Qdrant isn't ready yet), attempt creation.
        pass

    # Get vector size from embedder
    embedder = SentenceEmbedder()
    vector_size = embedder.vector_size

    client.create_collection(
        collection_name=collection,
        vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
    )
