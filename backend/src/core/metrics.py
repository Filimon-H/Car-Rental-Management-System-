"""In-process request metrics.

Deliberately dependency-free: it answers "what is slow, what is erroring, how much
traffic" without adding a metrics backend. Counters live in memory, so they reset on
restart and are per-process — with several workers, scrape each one. If this outgrows
itself, swap the recording calls for a Prometheus client; the call sites stay the same.
"""

import threading
import time
from collections import defaultdict
from typing import Any

# Upper bound of each latency bucket, in milliseconds.
_LATENCY_BUCKETS_MS = (10, 25, 50, 100, 250, 500, 1000, 2500, 5000)


class _Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._requests: dict[tuple[str, str, int], int] = defaultdict(int)
        self._latency_sum_ms: dict[tuple[str, str], float] = defaultdict(float)
        self._latency_count: dict[tuple[str, str], int] = defaultdict(int)
        self._latency_buckets: dict[tuple[str, str], list[int]] = defaultdict(
            lambda: [0] * (len(_LATENCY_BUCKETS_MS) + 1)
        )
        self._slowest: dict[tuple[str, str], float] = defaultdict(float)

    def record_request(self, method: str, path: str, status_code: int, duration_ms: float) -> None:
        key = (method, path)
        with self._lock:
            self._requests[(method, path, status_code)] += 1
            self._latency_sum_ms[key] += duration_ms
            self._latency_count[key] += 1
            if duration_ms > self._slowest[key]:
                self._slowest[key] = duration_ms

            buckets = self._latency_buckets[key]
            for index, upper in enumerate(_LATENCY_BUCKETS_MS):
                if duration_ms <= upper:
                    buckets[index] += 1
                    break
            else:
                buckets[-1] += 1

    def snapshot(self) -> dict[str, Any]:
        """Current counters, aggregated per route."""
        with self._lock:
            total = sum(self._requests.values())
            errors = sum(c for (_, _, status), c in self._requests.items() if status >= 500)
            client_errors = sum(
                c for (_, _, status), c in self._requests.items() if 400 <= status < 500
            )

            routes = []
            for (method, path), count in sorted(
                self._latency_count.items(), key=lambda kv: kv[1], reverse=True
            ):
                routes.append({
                    "method": method,
                    "path": path,
                    "requests": count,
                    "avg_ms": round(self._latency_sum_ms[(method, path)] / count, 2),
                    "max_ms": round(self._slowest[(method, path)], 2),
                })

            by_status: dict[str, int] = defaultdict(int)
            for (_, _, status), count in self._requests.items():
                by_status[str(status)] += count

            return {
                "uptime_seconds": round(time.time() - self._started_at, 1),
                "requests_total": total,
                "server_errors_total": errors,
                "client_errors_total": client_errors,
                "error_rate": round(errors / total, 4) if total else 0.0,
                "by_status": dict(sorted(by_status.items())),
                # Busiest first — the routes worth optimising.
                "routes": routes[:25],
            }

    def prometheus(self) -> str:
        """Render the counters in Prometheus text exposition format."""
        lines: list[str] = []
        with self._lock:
            lines.append("# HELP http_requests_total Total HTTP requests.")
            lines.append("# TYPE http_requests_total counter")
            for (method, path, status), count in sorted(self._requests.items()):
                lines.append(
                    f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}'
                )

            lines.append("# HELP http_request_duration_ms Request duration in milliseconds.")
            lines.append("# TYPE http_request_duration_ms histogram")
            for (method, path), buckets in sorted(self._latency_buckets.items()):
                cumulative = 0
                for index, upper in enumerate(_LATENCY_BUCKETS_MS):
                    cumulative += buckets[index]
                    lines.append(
                        f'http_request_duration_ms_bucket{{method="{method}",path="{path}",le="{upper}"}} {cumulative}'
                    )
                cumulative += buckets[-1]
                lines.append(
                    f'http_request_duration_ms_bucket{{method="{method}",path="{path}",le="+Inf"}} {cumulative}'
                )
                lines.append(
                    f'http_request_duration_ms_sum{{method="{method}",path="{path}"}} '
                    f'{self._latency_sum_ms[(method, path)]:.2f}'
                )
                lines.append(
                    f'http_request_duration_ms_count{{method="{method}",path="{path}"}} '
                    f'{self._latency_count[(method, path)]}'
                )

        return "\n".join(lines) + "\n"

    def reset(self) -> None:
        with self._lock:
            self._requests.clear()
            self._latency_sum_ms.clear()
            self._latency_count.clear()
            self._latency_buckets.clear()
            self._slowest.clear()


metrics = _Metrics()
