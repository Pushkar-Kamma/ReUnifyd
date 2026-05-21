"""
Simple in-memory IP-based rate limiter for auth endpoints.

This is a sliding-window counter per (key, ip) and is intended as a basic
defense-in-depth measure against brute force / credential stuffing. It is
single-process and resets on restart; for distributed deployments, swap for
a Redis-backed limiter.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status


class _SlidingWindow:
    def __init__(self, max_events: int, window_s: float):
        self.max = max_events
        self.window = window_s
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_sweep = 0.0

    def _sweep(self, now: float) -> None:
        # Cheap periodic cleanup of stale keys (avoid unbounded memory growth).
        if now - self._last_sweep < 60.0:
            return
        self._last_sweep = now
        cutoff = now - self.window
        for key in list(self._buckets.keys()):
            dq = self._buckets[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if not dq:
                self._buckets.pop(key, None)

    def hit(self, key: str) -> tuple[bool, float]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        with self._lock:
            self._sweep(now)
            dq = self._buckets.setdefault(key, deque())
            cutoff = now - self.window
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.max:
                retry = max(0.0, self.window - (now - dq[0]))
                return False, retry
            dq.append(now)
            return True, 0.0


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


def rate_limit(
    name: str,
    max_events: int,
    window_s: float,
) -> Callable[[Request], None]:
    """Returns a FastAPI dependency enforcing the limit per (name, client-ip)."""
    window = _SlidingWindow(max_events, window_s)

    def dep(request: Request) -> None:
        key = f"{name}:{_client_ip(request)}"
        allowed, retry_after = window.hit(key)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again shortly.",
                headers={"Retry-After": str(int(retry_after) + 1)},
            )

    return dep
