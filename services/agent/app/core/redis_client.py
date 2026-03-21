"""
Redis client for the agent service.

Used for:
  - Caching conversation context (avoid re-querying DB on every turn)
  - Session token caching

All operations are safe-by-default: if Redis is unavailable the callers
fall back to PostgreSQL — no exception is ever raised to the caller.
"""

from __future__ import annotations

import json
import os
from typing import Any

import redis.asyncio as aioredis

from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    """Return a shared Redis client, or None if Redis is unavailable."""
    global _redis
    if _redis is not None:
        return _redis

    redis_url = os.getenv("REDIS_URL", "")
    if not redis_url:
        return None

    try:
        client: aioredis.Redis = aioredis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        _redis = client
        logger.info("redis_connected", host=redis_url.split("@")[-1].split("/")[0])
    except Exception as exc:
        logger.warning("redis_unavailable", error=str(exc))
        _redis = None

    return _redis


async def cache_set(key: str, value: dict[str, Any], ttl: int = 3600) -> bool:
    """
    Store a JSON-serialisable dict under the namespaced key.

    Returns True on success, False on any error (Redis down / serialisation error).
    """
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.setex(f"docsense:{key}", ttl, json.dumps(value, default=str))
        return True
    except Exception as exc:
        logger.warning("redis_set_failed", key=key, error=str(exc))
        return False


async def cache_get(key: str) -> dict[str, Any] | None:
    """
    Retrieve a previously cached value.

    Returns the dict if found, None if missing or Redis is unavailable.
    """
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(f"docsense:{key}")
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("redis_get_failed", key=key, error=str(exc))
        return None


async def cache_delete(key: str) -> None:
    """Delete a cached key. No-op if Redis is unavailable."""
    r = await get_redis()
    if r is None:
        return
    try:
        await r.delete(f"docsense:{key}")
    except Exception as exc:
        logger.warning("redis_delete_failed", key=key, error=str(exc))
