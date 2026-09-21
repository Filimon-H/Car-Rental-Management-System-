"""Staff and customer tokens must not authenticate against each other.

CustomerUser and StaffUser ids come from independent sequences, so a customer's
own token routinely carries a `sub` that matches a real staff user. Without an
issuer check that token authenticates as that staff member — including admin.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import (
    ISSUER_CUSTOMER,
    ISSUER_STAFF,
    create_access_token,
    hash_password,
)
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.staff_user import StaffUser


@pytest.fixture
def admin_user(db: Session) -> StaffUser:
    user = StaffUser(
        username="issuer_admin",
        email="issuer_admin@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Issuer Admin",
        role=Role.ADMIN,
        is_active=True,
        token_version=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def portal_user(db: Session) -> CustomerUser:
    customer = Customer(
        first_name="Portal",
        last_name="Person",
        phone_primary="0911777777",
        business_type="individual",
        is_active=True,
    )
    db.add(customer)
    db.flush()
    user = CustomerUser(
        customer_id=customer.id,
        email="portal_person@example.com",
        hashed_password=hash_password("testpass123"),
        token_version=0,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _customer_token(user: CustomerUser) -> str:
    return create_access_token(
        {"sub": str(user.id), "tv": user.token_version, "iss": ISSUER_CUSTOMER}
    )


class TestCustomerTokenCannotReachStaffApi:
    def test_cannot_list_staff_users(
        self, client: TestClient, admin_user: StaffUser, portal_user: CustomerUser
    ):
        token = _customer_token(portal_user)
        response = client.get("/api/users", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    def test_cannot_list_customers(
        self, client: TestClient, admin_user: StaffUser, portal_user: CustomerUser
    ):
        token = _customer_token(portal_user)
        response = client.get("/api/customers", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    def test_cannot_create_a_staff_admin(
        self,
        client: TestClient,
        db: Session,
        admin_user: StaffUser,
        portal_user: CustomerUser,
    ):
        """The full compromise: minting a new admin account from a portal login."""
        token = _customer_token(portal_user)
        response = client.post(
            "/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "username": "backdoor",
                "email": "backdoor@example.com",
                "password": "Passw0rd!123",
                "full_name": "Backdoor",
                "role": "admin",
            },
        )
        assert response.status_code == 401
        # The account must not exist even though the request was rejected.
        assert (
            db.query(StaffUser).filter(StaffUser.username == "backdoor").first() is None
        )


class TestTokensWithoutAnIssuerAreRejected:
    """Fails closed, so tokens predating the issuer check cannot be replayed."""

    def test_staff_endpoint_rejects_issuerless_token(
        self, client: TestClient, admin_user: StaffUser
    ):
        from src.core.security import jwt, settings

        token = jwt.encode(
            {
                "sub": str(admin_user.id),
                "tv": admin_user.token_version,
                "type": "access",
                "exp": 9999999999,
            },
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )
        response = client.get("/api/users", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


class TestStaffTokenCannotReachCustomerPortal:
    def test_staff_token_rejected_by_portal(self, client: TestClient, admin_user: StaffUser):
        token = create_access_token(
            {"sub": str(admin_user.id), "tv": admin_user.token_version, "iss": ISSUER_STAFF}
        )
        response = client.get("/api/public/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
