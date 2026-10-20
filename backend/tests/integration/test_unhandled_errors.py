"""An unexpected error must not hand its internals to the caller.

The catch-all handler returned str(exc) whenever APP_ENV was development,
which is also its default. A failed signup showed the customer the SQL
statement, with their email and password hash among its parameters.
"""

from fastapi.testclient import TestClient


def test_unhandled_error_returns_a_generic_message(app):
    secret = "INSERT INTO customer_users ... '$2b$12$hash'"

    def boom():
        raise RuntimeError(secret)

    if not any(getattr(r, "path", None) == "/__test_boom" for r in app.routes):
        app.add_api_route("/__test_boom", boom)

    with TestClient(app, raise_server_exceptions=False) as c:
        res = c.get("/__test_boom")

    assert res.status_code == 500
    assert res.json() == {"error_code": "INTERNAL_ERROR", "detail": "Internal server error"}
    assert "hash" not in res.text
