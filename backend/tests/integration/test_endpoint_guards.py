"""Every staff endpoint checks the caller's role, not just that they signed in.

Hiding a menu item in the admin app is not the same as refusing the action:
anyone with a sales or inspector login can call the API directly. So each
staff route must carry a permission or role check. Only the caller's own
account (/api/me), sign-in, the public website API and health are open.
"""

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

GUARDS = {"permission_checker", "role_checker", "require_admin"}
OPEN_PREFIXES = ("/api/public", "/api/auth", "/api/me", "/api/v1/public", "/api/v1/auth", "/api/v1/me")
OPEN_PATHS = {"/", "/health"}
# Read-only dropdown values every staff role's forms use: a login is enough.
LOGIN_ONLY = {
    f"GET {prefix}/lookups/{rest}"
    for prefix in ("/api", "/api/v1")
    for rest in ("categories", "category/{category}", "defaults")
}


def _guarded(dependant) -> bool:
    if dependant.call is not None and getattr(dependant.call, "__name__", "") in GUARDS:
        return True
    return any(_guarded(sub) for sub in dependant.dependencies)


def test_every_staff_route_checks_a_permission(app):
    missing = sorted(
        f"{method} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        and route.path not in OPEN_PATHS
        and not route.path.startswith(OPEN_PREFIXES)
        and not _guarded(route.dependant)
        for method in route.methods - {"HEAD", "OPTIONS"}
        if f"{method} {route.path}" not in LOGIN_ONLY
    )
    assert missing == []


def test_lookup_values_need_a_staff_login(client: TestClient):
    for path in ("/api/lookups/categories", "/api/lookups/defaults", "/api/lookups/category/color"):
        assert client.get(path).status_code == 401, path
