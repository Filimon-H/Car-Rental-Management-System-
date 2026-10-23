"""Every route is served under /api/v1 and the legacy /api prefix."""
from fastapi.testclient import TestClient


class TestVersionedRoutes:
    def test_both_prefixes_resolve(self, client: TestClient):
        """Same handler, two paths — neither may 404."""
        for path in ("/api/auth/login", "/api/v1/auth/login"):
            r = client.post(path, json={"username": "nobody", "password": "wrongpass1"})
            assert r.status_code != 404, f"{path} did not resolve"

    def test_versioned_health_of_protected_route(self, client: TestClient):
        """Unauthenticated protected routes must 401/403, not 404, on both prefixes."""
        for path in ("/api/agreements", "/api/v1/agreements"):
            assert client.get(path).status_code in (401, 403), path

    def test_openapi_lists_each_route_once(self, client: TestClient):
        """Only the versioned mount is in the schema, so /docs isn't doubled."""
        paths = client.get("/openapi.json").json()["paths"]
        versioned = [p for p in paths if p.startswith("/api/v1/")]
        unversioned = [p for p in paths if p.startswith("/api/") and not p.startswith("/api/v1/")]
        assert versioned, "versioned routes missing from schema"
        assert not unversioned, f"legacy routes should not be in schema: {unversioned[:3]}"
