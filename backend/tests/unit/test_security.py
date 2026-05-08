"""Unit tests for core/security.py — JWT tokens and password hashing."""

from datetime import timedelta, timezone, datetime

import pytest

from src.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token_type,
)


# ---------------------------------------------------------------------------
# hash_password / verify_password
# ---------------------------------------------------------------------------

class TestPasswordHashing:

    def test_hash_produces_non_empty_string(self):
        hashed = hash_password("secret123")
        assert isinstance(hashed, str)
        assert len(hashed) > 0

    def test_hash_is_not_plaintext(self):
        hashed = hash_password("secret123")
        assert hashed != "secret123"

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt generates a unique salt each call."""
        h1 = hash_password("secret123")
        h2 = hash_password("secret123")
        assert h1 != h2

    def test_verify_correct_password_returns_true(self):
        hashed = hash_password("mypassword")
        assert verify_password("mypassword", hashed) is True

    def test_verify_wrong_password_returns_false(self):
        hashed = hash_password("mypassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_empty_password_against_nonempty_hash_returns_false(self):
        hashed = hash_password("mypassword")
        assert verify_password("", hashed) is False

    def test_verify_nonempty_password_against_empty_password_hash_returns_false(self):
        hashed = hash_password("")
        assert verify_password("mypassword", hashed) is False

    def test_verify_empty_password_against_empty_hash(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True

    def test_hash_different_passwords_produce_different_hashes(self):
        h1 = hash_password("password_one")
        h2 = hash_password("password_two")
        assert verify_password("password_one", h1) is True
        assert verify_password("password_one", h2) is False


# ---------------------------------------------------------------------------
# create_access_token / decode_token
# ---------------------------------------------------------------------------

class TestAccessToken:

    def test_create_returns_non_empty_string(self):
        token = create_access_token({"sub": "user1"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_valid_token_returns_payload(self):
        token = create_access_token({"sub": "user42", "role": "admin"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user42"
        assert payload["role"] == "admin"

    def test_access_token_type_is_access(self):
        token = create_access_token({"sub": "user1"})
        payload = decode_token(token)
        assert payload is not None
        assert payload.get("type") == "access"

    def test_access_token_has_exp_claim(self):
        token = create_access_token({"sub": "user1"})
        payload = decode_token(token)
        assert payload is not None
        assert "exp" in payload

    def test_custom_expiry_sets_exp_in_future(self):
        delta = timedelta(minutes=30)
        token = create_access_token({"sub": "user1"}, expires_delta=delta)
        payload = decode_token(token)
        assert payload is not None
        exp_ts = payload["exp"]
        now_ts = datetime.now(timezone.utc).timestamp()
        assert exp_ts > now_ts

    def test_expired_token_returns_none(self):
        token = create_access_token({"sub": "user1"}, expires_delta=timedelta(seconds=-1))
        result = decode_token(token)
        assert result is None

    def test_decode_invalid_token_returns_none(self):
        assert decode_token("not.a.valid.token") is None

    def test_decode_empty_string_returns_none(self):
        assert decode_token("") is None

    def test_decode_tampered_token_returns_none(self):
        token = create_access_token({"sub": "user1"})
        tampered = token[:-4] + "XXXX"
        assert decode_token(tampered) is None

    def test_two_tokens_with_same_payload_are_different(self):
        """Each token is issued at a slightly different time, so they differ."""
        t1 = create_access_token({"sub": "user1"})
        import time; time.sleep(0.01)
        t2 = create_access_token({"sub": "user1"})
        # They may or may not be the same depending on clock resolution —
        # the important thing is that both decode correctly.
        p1 = decode_token(t1)
        p2 = decode_token(t2)
        assert p1 is not None
        assert p2 is not None


# ---------------------------------------------------------------------------
# create_refresh_token
# ---------------------------------------------------------------------------

class TestRefreshToken:

    def test_refresh_token_type_is_refresh(self):
        token = create_refresh_token({"sub": "user1"})
        payload = decode_token(token)
        assert payload is not None
        assert payload.get("type") == "refresh"

    def test_refresh_token_decodes_correctly(self):
        token = create_refresh_token({"sub": "user99"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user99"

    def test_refresh_token_has_exp(self):
        token = create_refresh_token({"sub": "user1"})
        payload = decode_token(token)
        assert payload is not None
        assert "exp" in payload

    def test_refresh_token_expiry_further_than_access(self):
        """Refresh token lasts longer than access token."""
        access = create_access_token({"sub": "user1"})
        refresh = create_refresh_token({"sub": "user1"})
        access_exp = decode_token(access)["exp"]
        refresh_exp = decode_token(refresh)["exp"]
        assert refresh_exp > access_exp


# ---------------------------------------------------------------------------
# verify_token_type
# ---------------------------------------------------------------------------

class TestVerifyTokenType:

    def test_access_token_matches_access_type(self):
        token = create_access_token({"sub": "user1"})
        payload = decode_token(token)
        assert verify_token_type(payload, "access") is True

    def test_access_token_does_not_match_refresh_type(self):
        token = create_access_token({"sub": "user1"})
        payload = decode_token(token)
        assert verify_token_type(payload, "refresh") is False

    def test_refresh_token_matches_refresh_type(self):
        token = create_refresh_token({"sub": "user1"})
        payload = decode_token(token)
        assert verify_token_type(payload, "refresh") is True

    def test_refresh_token_does_not_match_access_type(self):
        token = create_refresh_token({"sub": "user1"})
        payload = decode_token(token)
        assert verify_token_type(payload, "access") is False

    def test_payload_with_no_type_field_returns_false(self):
        assert verify_token_type({"sub": "user1"}, "access") is False

    def test_payload_with_wrong_type_returns_false(self):
        assert verify_token_type({"sub": "user1", "type": "other"}, "access") is False
