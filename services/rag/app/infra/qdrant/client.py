from __future__ import annotations

from functools import lru_cache

from qdrant_client import QdrantClient

from app.core.settings import settings


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    # Qdrant supports optional API keys. Keep it config-driven.
    if settings.qdrant_api_key:
        return QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
    return QdrantClient(url=settings.qdrant_url)
