"""Request metrics are recorded, grouped by route template, and admin-only."""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.metrics import metrics
from src.core.rbac import Role
from src.core.security import hash_password
from src.models.staff_user import StaffUser


def _user(db: Session, username: str, role: Role) -> StaffUser:
    u = StaffUser(username=username, email=f"{username}@e.com", full_name=username,
                  hashed_password=hash_password("testpass123"), role=role, is_active=True)
    db.add(u); db.commit()
    return u


def _headers(client: TestClient, username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestMetricsAccess:
    def test_requires_admin(self, client: TestClient, db: Session):
        _user(db, "sales_met", Role.SALES)
        assert client.get("/metrics", headers=_headers(client, "sales_met")).status_code == 403

    def test_unauthenticated_denied(self, client: TestClient):
        assert client.get("/metrics").status_code in (401, 403)

    def test_admin_allowed(self, client: TestClient, db: Session):
        _user(db, "admin_met", Role.ADMIN)
        r = client.get("/metrics", headers=_headers(client, "admin_met"))
        assert r.status_code == 200
        assert "requests_total" in r.json()


class TestMetricsRecording:
    def test_counts_requests_and_latency(self, client: TestClient, db: Session):
        metrics.reset()
        _user(db, "admin_rec", Role.ADMIN)
        h = _headers(client, "admin_rec")

        for _ in range(3):
            client.get("/health")

        body = client.get("/metrics", headers=h).json()
        assert body["requests_total"] >= 3
        health = [r for r in body["routes"] if r["path"] == "/health"]
        assert health and health[0]["requests"] == 3
        assert health[0]["avg_ms"] >= 0

    def test_groups_by_route_template_not_concrete_path(self, client: TestClient, db: Session):
        """Per-id paths must collapse to one series, or cardinality grows unbounded."""
        metrics.reset()
        _user(db, "admin_card", Role.ADMIN)
        h = _headers(client, "admin_card")

        for agreement_id in (1, 2, 3):
            client.get(f"/api/agreements/{agreement_id}", headers=h)

        body = client.get("/metrics", headers=h).json()
        templated = [r for r in body["routes"] if "{" in r["path"] and "agreements" in r["path"]]
        assert templated, f"expected a templated agreements route, got {[r['path'] for r in body['routes']]}"
        assert templated[0]["requests"] == 3

    def test_prometheus_format(self, client: TestClient, db: Session):
        metrics.reset()
        _user(db, "admin_prom", Role.ADMIN)
        h = _headers(client, "admin_prom")
        client.get("/health")

        r = client.get("/metrics/prometheus", headers=h)
        assert r.status_code == 200
        assert "http_requests_total" in r.text
        assert "http_request_duration_ms_bucket" in r.text


class TestCorrelationId:
    def test_generated_id_is_returned(self, client: TestClient):
        """When the client sends none, the generated id must come back, not an empty header."""
        r = client.get("/health")
        assert r.headers.get("X-Correlation-ID"), "correlation id header was empty"

    def test_client_id_is_echoed(self, client: TestClient):
        r = client.get("/health", headers={"X-Correlation-ID": "abc-123"})
        assert r.headers["X-Correlation-ID"] == "abc-123"
