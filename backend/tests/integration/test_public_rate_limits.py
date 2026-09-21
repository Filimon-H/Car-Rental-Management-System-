"""The customer portal's credential endpoints must be rate limited.

They are unauthenticated and internet-facing. Staff login has had a 5/minute
limit from the start; these had none, leaving password brute-force and signup
spam unbounded.
"""

from fastapi.testclient import TestClient


class TestLoginIsRateLimited:
    def test_repeated_failures_are_eventually_blocked(self, client: TestClient):
        statuses = [
            client.post(
                "/api/public/auth/login",
                json={"email": "nobody@example.com", "password": "wrong-password"},
            ).status_code
            for _ in range(8)
        ]

        assert 429 in statuses, f"brute force was never throttled: {statuses}"
        # The limit is 5/minute, so the first few must still be answered normally
        # rather than everything being blocked.
        assert statuses[0] == 401


class TestSignupIsRateLimited:
    def test_bulk_signups_are_eventually_blocked(self, client: TestClient):
        statuses = [
            client.post(
                "/api/public/auth/signup",
                json={
                    "email": f"spam{i}@example.com",
                    "password": "Passw0rd!123",
                    "first_name": "Spam",
                    "last_name": "Account",
                    "phone": f"09112223{i:02d}",
                },
            ).status_code
            for i in range(6)
        ]

        assert 429 in statuses, f"signup spam was never throttled: {statuses}"
        assert statuses[0] == 200
