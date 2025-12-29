from qdrant_client.http import models as qm

from app.core.settings import settings
from app.infra.qdrant.client import get_qdrant_client


def ensure_collection() -> None:
    client = get_qdrant_client()
    collection = settings.qdrant_collection

    try:
        client.get_collection(collection)
        return
    except Exception:
        # If it doesn't exist (or Qdrant isn't ready yet), attempt creation.
        pass

    client.create_collection(
        collection_name=collection,
        vectors_config=qm.VectorParams(size=settings.qdrant_vector_size, distance=qm.Distance.COSINE),
    )
