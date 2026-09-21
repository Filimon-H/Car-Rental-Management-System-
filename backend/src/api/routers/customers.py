"""Customers API router."""

import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.core.security import hash_password
from src.models.agreement import Agreement
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramCustomerLinkCode
from src.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerSearchResult,
    CustomerUpdate,
)
from src.services.customer_validation_service import find_customer_by_phone

router = APIRouter()


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_online_registered: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """List customers with pagination and optional search.

    `is_online_registered` filters in SQL so the count and the rows cover every
    customer, not just the ones on the current page.
    """
    query = db.query(Customer).options(joinedload(Customer.customer_user))

    # Filter by active status
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)

    # Mirrors CustomerResponse.is_online_registered: a linked portal account whose
    # email is a real one, not the placeholder the Telegram bot creates.
    if is_online_registered is not None:
        online_predicate = Customer.customer_user.has(
            and_(
                CustomerUser.email.isnot(None),
                ~CustomerUser.email.like("%@bot.nodcarrent.internal"),
            )
        )
        query = query.filter(online_predicate if is_online_registered else ~online_predicate)

    # Search by name, phone, or ID number
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Customer.first_name.ilike(search_term),
                Customer.last_name.ilike(search_term),
                Customer.phone_primary.ilike(search_term),
                Customer.id_number.ilike(search_term),
            )
        )

    # Get total count
    total = query.count()

    # Paginate
    offset = (page - 1) * page_size
    customers = query.order_by(Customer.first_name, Customer.last_name).offset(offset).limit(page_size).all()
    
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(c) for c in customers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/check-duplicate")
async def check_duplicate(
    id_number: Optional[str] = Query(None),
    license_number: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    exclude_id: Optional[int] = Query(None, description="Customer ID to exclude (for updates)"),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Check if a customer with the given ID number, license, or phone already exists."""
    if not id_number and not license_number and not phone:
        return {"duplicate": False, "customer_id": None, "match": None}
    
    query = db.query(Customer).filter(Customer.is_active == True)
    
    if exclude_id:
        query = query.filter(Customer.id != exclude_id)
    
    # Check ID number first (most unique)
    if id_number:
        existing = query.filter(Customer.id_number == id_number).first()
        if existing:
            return {
                "duplicate": True,
                "customer_id": existing.id,
                "customer_name": f"{existing.first_name} {existing.last_name}",
                "match": "id_number"
            }
    
    # Check license number
    if license_number:
        existing = query.filter(Customer.license_number == license_number).first()
        if existing:
            return {
                "duplicate": True,
                "customer_id": existing.id,
                "customer_name": f"{existing.first_name} {existing.last_name}",
                "match": "license_number"
            }
    
    # Check phone
    if phone:
        existing = query.filter(Customer.phone_primary == phone).first()
        if existing:
            return {
                "duplicate": True,
                "customer_id": existing.id,
                "customer_name": f"{existing.first_name} {existing.last_name}",
                "match": "phone"
            }
    
    return {"duplicate": False, "customer_id": None, "match": None}


@router.get("/search", response_model=list[CustomerSearchResult])
async def search_customers(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Quick search for customer lookup modal."""
    search_term = f"%{q}%"
    customers = (
        db.query(Customer)
        .filter(Customer.is_active == True)
        .filter(
            or_(
                Customer.first_name.ilike(search_term),
                Customer.last_name.ilike(search_term),
                Customer.phone_primary.ilike(search_term),
                Customer.id_number.ilike(search_term),
            )
        )
        .order_by(Customer.first_name, Customer.last_name)
        .limit(limit)
        .all()
    )
    
    return [CustomerSearchResult.model_validate(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Get a single customer by ID."""
    customer = (
        db.query(Customer)
        .options(joinedload(Customer.customer_user))
        .filter(Customer.id == customer_id)
        .first()
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return CustomerResponse.model_validate(customer)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Create a new customer."""
    # Check for duplicate ID number (only if provided)
    if data.id_number:
        existing = db.query(Customer).filter(Customer.id_number == data.id_number).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer with this ID number already exists",
            )
    if find_customer_by_phone(db, data.phone_primary):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer with this phone number already exists",
        )
    
    # Map schema fields to model fields
    customer_data = {
        "business_type": data.business_type,
        "company_name": data.company_name,
        "tin_number": data.tin_number,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "phone_primary": data.phone_primary,
        "phone_secondary": data.phone_secondary,
        "email": data.email,
        "id_type": data.id_type,
        "id_number": data.id_number,
        "id_expiry": data.id_expiry_date,
        "license_number": data.driver_license_number,
        "license_expiry": data.driver_license_expiry,
        "house_number": data.house_number,
        "wereda": data.wereda,
        "subcity": data.subcity,
        "city": data.city,
        "emergency_contact_name": data.emergency_contact_name,
        "emergency_contact_phone": data.emergency_contact_phone,
        "telegram_username": data.telegram_username,
        "notes": data.notes,
    }
    customer = Customer(**{k: v for k, v in customer_data.items() if v is not None})
    db.add(customer)
    db.commit()
    db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Update an existing customer."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    
    # Check for duplicate ID number if being changed
    if data.id_number and data.id_number != customer.id_number:
        existing = db.query(Customer).filter(
            Customer.id_number == data.id_number,
            Customer.id != customer_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer with this ID number already exists",
            )
    if data.phone_primary and find_customer_by_phone(
        db, data.phone_primary, exclude_customer_id=customer_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer with this phone number already exists",
        )
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    
    db.commit()
    db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Soft-delete a customer (mark as inactive to preserve audit trail)."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )

    customer.is_active = False
    db.commit()

    return None


class BotLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime
    customer_name: str
    phone_primary: str
    telegram_username: Optional[str]
    bot_message: str  # Pre-formatted message staff can copy and send


@router.post("/{customer_id}/bot-link-code", response_model=BotLinkCodeResponse)
async def generate_bot_link_code(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Generate a Telegram bot link code for a staff-registered customer.

    Auto-creates a CustomerUser if the customer doesn't have one yet,
    using an internal placeholder email so they can use the bot without
    needing to sign up on the website.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Find or create CustomerUser
    customer_user = db.query(CustomerUser).filter(CustomerUser.customer_id == customer_id).first()
    if not customer_user:
        # Use real email if provided, else internal placeholder
        email = customer.email or f"customer_{customer_id}@bot.nodcarrent.internal"
        # Check placeholder uniqueness
        existing = db.query(CustomerUser).filter(CustomerUser.email == email).first()
        if existing and existing.customer_id != customer_id:
            email = f"customer_{customer_id}_{secrets.token_hex(4)}@bot.nodcarrent.internal"
        customer_user = CustomerUser(
            customer_id=customer_id,
            email=email,
            hashed_password=hash_password(secrets.token_hex(16)),  # random, not used
            is_active=True,
        )
        db.add(customer_user)
        db.flush()

    # Generate 6-char uppercase code
    alphabet = string.ascii_uppercase + string.digits
    code = "".join(secrets.choice(alphabet) for _ in range(6))
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    # Invalidate old unused codes for this user
    db.query(TelegramCustomerLinkCode).filter(
        TelegramCustomerLinkCode.customer_user_id == customer_user.id,
        TelegramCustomerLinkCode.used_at.is_(None),
    ).delete(synchronize_session=False)

    link_code = TelegramCustomerLinkCode(
        customer_user_id=customer_user.id,
        code=code,
        expires_at=expires_at,
    )
    db.add(link_code)
    db.commit()

    bot_message = (
        f"Hi {customer.first_name}! You can now manage your rentals on our Telegram bot.\n"
        f"1. Open @Novacar67_bot on Telegram\n"
        f"2. Send this message: /link {code}\n"
        f"Code expires in 24 hours."
    )

    return BotLinkCodeResponse(
        code=code,
        expires_at=expires_at,
        customer_name=customer.full_name,
        phone_primary=customer.phone_primary,
        telegram_username=customer.telegram_username,
        bot_message=bot_message,
    )


# ---------------------------------------------------------------------------
# Customer cross-agreement ledger
# ---------------------------------------------------------------------------


class CustomerLedgerEntry(BaseModel):
    id: int
    agreement_id: int
    agreement_number: str
    entry_type: str
    amount: Decimal
    description: str
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    reversed_entry_id: Optional[int] = None
    created_by_id: Optional[int] = None
    created_at: str

    class Config:
        from_attributes = True


@router.get("/{customer_id}/ledger", response_model=list[CustomerLedgerEntry])
async def get_customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_AGREEMENTS)),
):
    """All ledger entries across every agreement for a customer, oldest first."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    rows = (
        db.query(LedgerEntry, Agreement.agreement_number)
        .join(Agreement, Agreement.id == LedgerEntry.agreement_id)
        .filter(Agreement.customer_id == customer_id)
        .order_by(LedgerEntry.created_at.asc())
        .all()
    )
    return [
        CustomerLedgerEntry(
            id=e.id,
            agreement_id=e.agreement_id,
            agreement_number=agr_num,
            entry_type=e.entry_type.value,
            amount=e.amount,
            description=e.description,
            payment_method=e.payment_method.value if e.payment_method else None,
            payment_reference=e.payment_reference,
            notes=e.notes,
            reversed_entry_id=e.reversed_entry_id,
            created_by_id=e.created_by_id,
            created_at=e.created_at.isoformat(),
        )
        for e, agr_num in rows
    ]
