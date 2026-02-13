from qdrant_client.http import models as qm
from app.core.settings import settings
from app.embeddings.sentence_embedder import SentenceEmbedder
from app.infra.qdrant.client import get_qdrant_client
def ensure_collection() -> None:
    client = get_qdrant_client()
    collection = settings.qdrant_collection
    try:
        existing = client.get_collection(collection)
        return
    except Exception:
        pass
    embedder = SentenceEmbedder()
    vector_size = embedder.vector_size
    client.create_collection(
        collection_name=collection,
        vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
    )
