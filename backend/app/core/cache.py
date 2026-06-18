"""
EchoVision Backend — Cache Layer

Provides an asynchronous Redis client and caching decorators/helpers
to dramatically reduce latency on deterministic AI endpoint responses.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from redis import asyncio as aioredis
from redis.asyncio.client import Redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Global Redis connection pool
_redis_pool: aioredis.ConnectionPool | None = None
_redis_client: Redis | None = None


async def init_redis() -> None:
    """Initialize the global Redis connection pool."""
    global _redis_pool, _redis_client
    settings = get_settings()
    try:
        _redis_pool = aioredis.ConnectionPool.from_url(
            settings.redis_url, decode_responses=True, max_connections=10
        )
        _redis_client = Redis(connection_pool=_redis_pool)
        # Ping to ensure connection is alive
        await _redis_client.ping()
        logger.info("Redis cache initialized successfully.")
    except Exception as e:
        logger.warning(
            f"Could not connect to Redis at {settings.redis_url}. Caching will be disabled. Error: {e}"
        )
        _redis_pool = None
        _redis_client = None


async def close_redis() -> None:
    """Close the global Redis connection pool."""
    global _redis_pool, _redis_client
    if _redis_client:
        await _redis_client.close()
    if _redis_pool:
        await _redis_pool.disconnect()
    logger.info("Redis connection pool closed.")


async def get_cache(key: str) -> dict[str, Any] | None:
    """Retrieve a JSON-parsed value from the cache."""
    if _redis_client is None:
        return None
    try:
        data = await _redis_client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Redis get_cache error: {e}")
    return None


async def set_cache(key: str, value: dict[str, Any], expire_seconds: int = 3600) -> None:
    """Store a JSON-serializable value in the cache with an expiration."""
    if _redis_client is None:
        return
    try:
        data = json.dumps(value)
        await _redis_client.set(key, data, ex=expire_seconds)
    except Exception as e:
        logger.error(f"Redis set_cache error: {e}")
