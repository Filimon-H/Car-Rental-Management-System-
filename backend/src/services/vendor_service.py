"""Vendor settlement and payable calculations."""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from src.core.errors import BusinessError, ErrorCode, NotFoundError
from src.models.agreement import AgreementStatus
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.ledger_entry import PaymentMethod
from src.models.vendor import Vendor
from src.models.vendor_payment import VendorPayment
from src.services import billing_service


EARNED_STATUSES = {
    AgreementStatus.ACTIVE,
    AgreementStatus.OVERDUE,
    AgreementStatus.RETURNED,
    AgreementStatus.CLOSED,
}
RESERVED_STATUSES = {
    AgreementStatus.DRAFT,
    AgreementStatus.PENDING_PAYMENT,
}


@dataclass
class VendorAgreementPayable:
    agreement_id: int
    agreement_number: str
    agreement_status: str
    payable_amount: Decimal
    segment_count: int


def _segment_payable_amount(segment: AgreementVehicleSegment, commission_rate: Decimal) -> Decimal:
    _, charge = billing_service.calculate_rental_charge(
        segment.start_datetime,
        segment.end_datetime,
        segment.daily_rate,
    )
    return (charge * commission_rate / Decimal("100")).quantize(Decimal("0.01"))


def get_vendor_payable_summary(db: Session, vendor_id: int) -> dict:
    """Calculate what the business owes a vendor based on vehicle usage."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise NotFoundError("Vendor", vendor_id)

    segments = (
        db.query(AgreementVehicleSegment)
        .options(joinedload(AgreementVehicleSegment.agreement))
        .filter(AgreementVehicleSegment.vehicle.has(vendor_id=vendor_id))
        .all()
    )

    reserved_amount = Decimal("0")
    earned_amount = Decimal("0")
    agreement_totals: dict[int, VendorAgreementPayable] = {}

    for segment in segments:
        agreement = segment.agreement
        if agreement is None or agreement.status == AgreementStatus.CANCELLED:
            continue

        segment_amount = _segment_payable_amount(segment, vendor.commission_rate)
        if agreement.status in RESERVED_STATUSES:
            reserved_amount += segment_amount
        elif agreement.status in EARNED_STATUSES:
            earned_amount += segment_amount

        current = agreement_totals.get(agreement.id)
        if current is None:
            agreement_totals[agreement.id] = VendorAgreementPayable(
                agreement_id=agreement.id,
                agreement_number=agreement.agreement_number,
                agreement_status=agreement.status.value,
                payable_amount=segment_amount,
                segment_count=1,
            )
        else:
            current.payable_amount += segment_amount
            current.segment_count += 1

    paid_amount = (
        db.query(VendorPayment)
        .filter(VendorPayment.vendor_id == vendor_id)
        .with_entities(VendorPayment.amount)
        .all()
    )
    total_paid = sum((row[0] for row in paid_amount), Decimal("0"))
    outstanding_payable = earned_amount - total_paid

    agreement_items = sorted(
        agreement_totals.values(),
        key=lambda item: item.agreement_number,
        reverse=True,
    )

    return {
        "vendor_id": vendor.id,
        "vendor_name": vendor.company_name or vendor.contact_person or f"Vendor {vendor.id}",
        "commission_rate": vendor.commission_rate,
        "reserved_amount": reserved_amount,
        "earned_amount": earned_amount,
        "paid_amount": total_paid,
        "outstanding_payable": outstanding_payable,
        "agreement_count": len(agreement_items),
        "agreements": [
            {
                "agreement_id": item.agreement_id,
                "agreement_number": item.agreement_number,
                "agreement_status": item.agreement_status,
                "payable_amount": item.payable_amount,
                "segment_count": item.segment_count,
            }
            for item in agreement_items
        ],
    }


def list_vendor_payments(db: Session, vendor_id: int) -> list[VendorPayment]:
    """List settlement payments made to a vendor."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise NotFoundError("Vendor", vendor_id)

    return (
        db.query(VendorPayment)
        .filter(VendorPayment.vendor_id == vendor_id)
        .order_by(VendorPayment.created_at.desc(), VendorPayment.id.desc())
        .all()
    )


def post_vendor_payment(
    db: Session,
    vendor_id: int,
    amount: Decimal,
    payment_method: PaymentMethod,
    payment_reference: str | None = None,
    notes: str | None = None,
    agreement_id: int | None = None,
    created_by_id: int | None = None,
) -> VendorPayment:
    """Record a payment made to a vendor."""
    if amount <= 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Vendor payment amount must be positive")

    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise NotFoundError("Vendor", vendor_id)

    if agreement_id is not None:
        segment_exists = (
            db.query(AgreementVehicleSegment)
            .filter(
                AgreementVehicleSegment.agreement_id == agreement_id,
                AgreementVehicleSegment.vehicle.has(vendor_id=vendor_id),
            )
            .first()
        )
        if not segment_exists:
            raise BusinessError(
                ErrorCode.INVALID_INPUT,
                "Selected agreement does not include a vehicle from this vendor",
            )

    payment = VendorPayment(
        vendor_id=vendor_id,
        agreement_id=agreement_id,
        amount=amount,
        payment_method=payment_method,
        payment_reference=payment_reference,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment
