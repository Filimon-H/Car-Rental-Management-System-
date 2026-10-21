"""Linking an online login to a customer first entered at the counter.

Signup refused such a customer's phone as "already registered", a dead end.
Now the phone is proved one of two ways: by sharing it with the Telegram bot
(Telegram vouches for the number), or with a one-time invite link from staff,
who have seen the customer's ID.
"""

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password, verify_password
from src.models.account_claim import CustomerAccountClaim
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramCustomerLink
from src.services import account_claim_service as claims
from src.services.telegram_bot_service import TelegramBotService

PHONE = "+251911223344"
TG_USER, CHAT = 77001, 77001


@pytest.fixture
def walk_in(db: Session) -> Customer:
    """Entered by staff at the counter; no website login."""
    c = Customer(first_name="Almaz", last_name="Bekele", phone_primary=PHONE,
                 business_type="individual", is_active=True)
    db.add(c)
    db.commit()
    return c


@pytest.fixture
def staff_headers(client: TestClient, db: Session) -> dict:
    db.add(StaffUser(username="claims_admin", email="claims@nod.et", full_name="Claims Admin",
                     hashed_password=hash_password("testpass123"), role=Role.ADMIN, is_active=True))
    db.commit()
    r = client.post("/api/auth/login", json={"username": "claims_admin", "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def bot(monkeypatch, db: Session) -> TelegramBotService:
    from src.services import telegram_bot_service as mod

    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    monkeypatch.setattr(mod, "SessionLocal", lambda: db)
    monkeypatch.setattr(mod.settings, "telegram_bot_username", "NodCarRentBot")
    monkeypatch.setattr(claims.settings, "telegram_bot_username", "NodCarRentBot")
    svc._send_message = AsyncMock()
    svc.set_commands_for_chat = AsyncMock(return_value=True)
    return svc


def said(bot) -> str:
    return "\n".join(str(c.args[1]) for c in bot._send_message.await_args_list)


def send(bot, **message):
    message.setdefault("chat", {"id": CHAT})
    message.setdefault("from", {"id": TG_USER, "username": "almaz_b"})
    asyncio.run(bot._process_update({"message": message}))


def signup(client, phone=PHONE, email="almaz@example.com"):
    return client.post("/api/public/auth/signup", json={
        "first_name": "Almaz", "last_name": "Bekele", "email": email, "phone": phone, "password": "almaz-pass-1",
    })


# --- Telegram ---------------------------------------------------------------

def test_signup_with_a_counter_customers_phone_asks_to_confirm_on_telegram(client, walk_in, bot):
    r = signup(client)
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "confirm_identity"
    assert body["telegram_url"] == f"https://t.me/NodCarRentBot?start=claim_{body['claim_token']}"
    # Nothing is created until the phone is proved.
    assert client.get(f"/api/public/auth/claims/{body['claim_token']}").json() == {
        "status": "pending", "access_token": None}


def test_sharing_your_own_matching_phone_links_the_account(client, db, walk_in, bot):
    cid = walk_in.id  # the bot closes its session, detaching fixtures
    token = signup(client).json()["claim_token"]
    send(bot, text=f"/start claim_{token}")
    assert "share your phone number" in said(bot)

    send(bot, contact={"phone_number": "251911223344", "user_id": TG_USER})

    login = db.query(CustomerUser).filter_by(customer_id=cid).one()
    assert login.email == "almaz@example.com"
    assert verify_password("almaz-pass-1", login.hashed_password)
    assert db.query(TelegramCustomerLink).filter_by(customer_user_id=login.id, chat_id=CHAT).count() == 1
    assert "Confirmed, Almaz" in said(bot)

    # The waiting signup page is signed in, and the password works from now on.
    status = client.get(f"/api/public/auth/claims/{token}").json()
    assert status["status"] == "linked" and status["access_token"]
    assert client.post("/api/public/auth/login",
                       json={"email": "almaz@example.com", "password": "almaz-pass-1"}).status_code == 200


def test_a_forwarded_contact_is_not_proof(client, db, walk_in, bot):
    cid = walk_in.id  # the bot closes its session, detaching fixtures
    """Anyone can forward a contact card; only the owner can share their own."""
    token = signup(client).json()["claim_token"]
    send(bot, text=f"/start claim_{token}")
    send(bot, contact={"phone_number": PHONE, "user_id": 99999})

    assert db.query(CustomerUser).filter_by(customer_id=cid).count() == 0
    assert "your own phone number" in said(bot)


def test_a_different_number_is_refused_and_three_tries_end_the_claim(client, db, walk_in, bot):
    cid = walk_in.id  # the bot closes its session, detaching fixtures
    token = signup(client).json()["claim_token"]
    send(bot, text=f"/start claim_{token}")
    for _ in range(3):
        send(bot, contact={"phone_number": "+251922000000", "user_id": TG_USER})

    assert db.query(CustomerUser).filter_by(customer_id=cid).count() == 0
    assert "doesn't match" in said(bot) and "2 tries left" in said(bot)
    assert client.get(f"/api/public/auth/claims/{token}").json()["status"] == "expired"


def test_a_contact_without_an_open_claim_gets_the_old_reply(bot):
    send(bot, contact={"phone_number": PHONE, "user_id": TG_USER})
    assert "I only need a phone number when I ask for one" in said(bot)


def test_an_unknown_claim_link_is_refused_without_echoing_it(bot):
    send(bot, text="/start claim_not-a-real-token")
    assert "not valid" in said(bot) and "not-a-real" not in said(bot)


def test_a_customer_who_already_has_a_login_is_told_to_sign_in(client, db, walk_in):
    db.add(CustomerUser(customer_id=walk_in.id, email="almaz@real.example.com",
                        hashed_password=hash_password("x" * 10), token_version=0, is_active=True))
    db.commit()
    r = signup(client, email="other@example.com")
    assert r.status_code == 409
    assert "Sign in instead" in r.json()["detail"]


def test_a_bot_only_login_is_upgraded_not_duplicated(client, db, walk_in, bot):
    """Staff bot link codes give counter customers a placeholder login."""
    cid = walk_in.id  # the bot closes its session, detaching fixtures
    placeholder = CustomerUser(customer_id=cid, email=f"customer_{cid}@bot.nodcarrent.internal",
                               hashed_password=hash_password("random-unused"), token_version=0, is_active=True)
    db.add(placeholder)
    db.commit()
    placeholder_id = placeholder.id
    token = signup(client).json()["claim_token"]
    send(bot, text=f"/start claim_{token}")
    send(bot, contact={"phone_number": PHONE, "user_id": TG_USER})

    logins = db.query(CustomerUser).filter_by(customer_id=cid).all()
    assert [u.id for u in logins] == [placeholder_id]
    assert logins[0].email == "almaz@example.com"


def test_only_a_hash_of_the_token_is_stored(client, db, walk_in):
    token = signup(client).json()["claim_token"]
    stored = db.query(CustomerAccountClaim).one()
    assert token not in (stored.token_hash, stored.email)
    assert stored.hashed_password != "almaz-pass-1"


# --- Staff invite -------------------------------------------------------------

def test_staff_invite_lets_the_customer_set_up_their_account(client, db, walk_in, staff_headers):
    status = client.get(f"/api/customers/{walk_in.id}/online-account", headers=staff_headers).json()
    assert status["has_account"] is False and status["invite_expires_at"] is None

    r = client.post(f"/api/customers/{walk_in.id}/online-account-invite", headers=staff_headers)
    assert r.status_code == 200
    url = r.json()["url"]
    assert "/claim/" in url and url in r.json()["message"]
    token = url.rsplit("/", 1)[1]

    details = client.get(f"/api/public/auth/invites/{token}").json()
    assert details["first_name"] == "Almaz"

    accepted = client.post(f"/api/public/auth/invites/{token}",
                           json={"email": "almaz@example.com", "password": "almaz-pass-1"})
    assert accepted.status_code == 200 and accepted.json()["access_token"]

    status = client.get(f"/api/customers/{walk_in.id}/online-account", headers=staff_headers).json()
    assert status == {"has_account": True, "email": "almaz@example.com", "telegram_linked": False,
                      "invite_expires_at": None}


def test_an_invite_works_once(client, walk_in, staff_headers):
    token = client.post(f"/api/customers/{walk_in.id}/online-account-invite",
                        headers=staff_headers).json()["url"].rsplit("/", 1)[1]
    body = {"email": "almaz@example.com", "password": "almaz-pass-1"}
    assert client.post(f"/api/public/auth/invites/{token}", json=body).status_code == 200
    again = client.post(f"/api/public/auth/invites/{token}", json={**body, "email": "x@example.com"})
    assert again.status_code == 400 and "already been used" in again.json()["detail"]


def test_a_new_invite_replaces_the_old_one(client, walk_in, staff_headers):
    first = client.post(f"/api/customers/{walk_in.id}/online-account-invite",
                        headers=staff_headers).json()["url"].rsplit("/", 1)[1]
    client.post(f"/api/customers/{walk_in.id}/online-account-invite", headers=staff_headers)
    r = client.get(f"/api/public/auth/invites/{first}")
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_an_expired_invite_is_refused(client, db, walk_in, staff_headers):
    token = client.post(f"/api/customers/{walk_in.id}/online-account-invite",
                        headers=staff_headers).json()["url"].rsplit("/", 1)[1]
    claim = db.query(CustomerAccountClaim).one()
    claim.expires_at = claims._now() - timedelta(minutes=1)
    db.commit()
    assert client.get(f"/api/public/auth/invites/{token}").status_code == 400


def test_no_invite_for_a_customer_who_already_signs_in(client, db, walk_in, staff_headers):
    db.add(CustomerUser(customer_id=walk_in.id, email="almaz@real.example.com",
                        hashed_password=hash_password("x" * 10), token_version=0, is_active=True))
    db.commit()
    r = client.post(f"/api/customers/{walk_in.id}/online-account-invite", headers=staff_headers)
    assert r.status_code == 409


def test_an_invite_cannot_take_an_email_someone_else_uses(client, db, walk_in, staff_headers):
    other = Customer(first_name="O", last_name="T", phone_primary="+251911000777",
                     business_type="individual", is_active=True)
    db.add(other)
    db.commit()
    db.add(CustomerUser(customer_id=other.id, email="taken@example.com",
                        hashed_password=hash_password("x" * 10), token_version=0, is_active=True))
    db.commit()
    token = client.post(f"/api/customers/{walk_in.id}/online-account-invite",
                        headers=staff_headers).json()["url"].rsplit("/", 1)[1]
    r = client.post(f"/api/public/auth/invites/{token}",
                    json={"email": "taken@example.com", "password": "almaz-pass-1"})
    assert r.status_code == 409
