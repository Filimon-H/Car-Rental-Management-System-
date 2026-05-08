"""Integration tests for authentication endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.core.rbac import Role
from src.models.staff_user import StaffUser


@pytest.fixture
def test_user(db: Session) -> StaffUser:
    """Create a test user for authentication tests."""
    user = StaffUser(
        username="testuser",
        email="test@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Test User",
        role=Role.SALES,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def inactive_user(db: Session) -> StaffUser:
    """Create an inactive test user."""
    user = StaffUser(
        username="inactive",
        email="inactive@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Inactive User",
        role=Role.SALES,
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestLogin:
    """Test login endpoint."""

    def test_login_success(self, client: TestClient, test_user: StaffUser):
        """Successful login returns tokens."""
        response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client: TestClient, test_user: StaffUser):
        """Wrong password returns 401."""
        response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "wrongpass"},
        )
        assert response.status_code == 401
        assert "Invalid username or password" in response.json()["detail"]

    def test_login_nonexistent_user(self, client: TestClient):
        """Nonexistent user returns 401."""
        response = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "testpass123"},
        )
        assert response.status_code == 401

    def test_login_inactive_user(self, client: TestClient, inactive_user: StaffUser):
        """Inactive user cannot login."""
        response = client.post(
            "/api/auth/login",
            json={"username": "inactive", "password": "testpass123"},
        )
        assert response.status_code == 401
        assert "deactivated" in response.json()["detail"]


class TestRefreshToken:
    """Test refresh token endpoint."""

    def test_refresh_success(self, client: TestClient, test_user: StaffUser):
        """Valid refresh token returns new tokens."""
        # First login to get tokens
        login_response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        refresh_token = login_response.json()["refresh_token"]

        # Use refresh token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_refresh_invalid_token(self, client: TestClient):
        """Invalid refresh token returns 401."""
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid_token"},
        )
        assert response.status_code == 401


class TestMeEndpoint:
    """Test /me endpoint."""

    def test_get_me_authenticated(self, client: TestClient, test_user: StaffUser):
        """Authenticated user can get their profile."""
        # Login first
        login_response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        access_token = login_response.json()["access_token"]

        # Get profile
        response = client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert data["role"] == "sales"
        assert "permissions" in data

    def test_get_me_unauthenticated(self, client: TestClient):
        """Unauthenticated request returns 401."""
        response = client.get("/api/me")
        assert response.status_code == 401

    def test_get_me_invalid_token(self, client: TestClient):
        """Invalid token returns 401."""
        response = client.get(
            "/api/me",
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401


class TestPasswordChange:
    """Test password change endpoint."""

    def test_change_password_success(self, client: TestClient, test_user: StaffUser):
        """User can change their password."""
        # Login
        login_response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        access_token = login_response.json()["access_token"]

        # Change password
        response = client.post(
            "/api/me/change-password",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"current_password": "testpass123", "new_password": "newpass456"},
        )
        assert response.status_code == 200

        # Login with new password
        new_login = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "newpass456"},
        )
        assert new_login.status_code == 200

    def test_change_password_wrong_current(self, client: TestClient, test_user: StaffUser):
        """Wrong current password returns error."""
        # Login
        login_response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        access_token = login_response.json()["access_token"]

        # Try to change with wrong current password
        response = client.post(
            "/api/me/change-password",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"current_password": "wrongpass", "new_password": "newpass456"},
        )
        assert response.status_code == 401
