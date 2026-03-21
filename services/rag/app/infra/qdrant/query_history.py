"""
Query History — stores Q&A pairs as vectors in Qdrant for similarity lookup.

Every successful RAG query gets stored as an embedding of the question.
The GET /similar-queries endpoint uses this to surface relevant past Q&A.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.core.settings import settings

logger = logging.getLogger(__name__)

COLLECTION = settings.query_history_collection
VECTOR_SIZE = settings.qdrant_vector_size


def _get_client() -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
    )


def ensure_query_history_collection() -> None:
    client = _get_client()
    try:
        client.get_collection(COLLECTION)
    except Exception:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=qm.VectorParams(
                size=VECTOR_SIZE,
                distance=qm.Distance.COSINE,
            ),
        )
        logger.info("query_history_collection_created", collection=COLLECTION)


def store_query(
    embedder,
    question: str,
    answer: str,
    workspace_id: str,
    session_id: Optional[str] = None,
) -> None:
    """
    Embed the question and upsert into the query_history collection.
    Runs synchronously — call from background task to avoid blocking.
    """
    try:
        client = _get_client()
        vector = embedder.embed(question)
        point_id = str(uuid.uuid4())

        client.upsert(
            collection_name=COLLECTION,
            points=[
                qm.PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "question": question,
                        "answer": answer[:500],  # truncate to save space
                        "workspace_id": workspace_id,
                        "session_id": session_id or "",
                    },
                )
            ],
        )
    except Exception as exc:
        logger.warning("query_history_store_failed: %s", exc)


def find_similar(
    embedder,
    query: str,
    workspace_id: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Find similar past queries using cosine similarity.

    Returns list of {question, answer, similarity} dicts.
    """
    try:
        client = _get_client()
        vector = embedder.embed(query)

        results = client.search(
            collection_name=COLLECTION,
            query_vector=vector,
            query_filter=qm.Filter(
                must=[
                    qm.FieldCondition(
                        key="workspace_id",
                        match=qm.MatchValue(value=workspace_id),
                    )
                ]
            ),
            limit=top_k,
            with_payload=True,
        )

        return [
            {
                "question": r.payload.get("question", ""),
                "answer": r.payload.get("answer", ""),
                "similarity": round(float(r.score), 4),
            }
            for r in results
            if r.payload
        ]
    except Exception as exc:
        logger.warning("similar_queries_failed: %s", exc)
        return []
