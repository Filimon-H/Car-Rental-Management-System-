"""Printing service for document generation."""

import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.errors import BusinessError, ErrorCode
from src.models.ledger_entry import LedgerEntryType
from src.models.agreement import Agreement
from src.models.customer import Customer
from src.models.vehicle import Vehicle
from src.services import ledger_service

logger = logging.getLogger(__name__)

# Templates directory
TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"
OUTPUT_DIR = Path(__file__).parent.parent.parent / "generated_docs"


def ensure_output_dir():
    """Ensure output directory exists."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def format_currency(amount: Decimal) -> str:
    """Format amount as Ethiopian Birr."""
    return f"ETB {amount:,.2f}"


def _to_local(dt: datetime) -> datetime:
    """Convert a stored timestamp to the configured local timezone.

    Ledger and agreement timestamps are stored in UTC. Printing them raw
    labelled a UTC time as local, so a payment taken at 11:38 in
    Africa/Addis_Ababa appeared on the receipt as 08:38 — three hours early.
    Naive values are assumed UTC, which is how they are written.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo(settings.scheduler_timezone))


def format_payment_method(method) -> str:
    """Human-readable payment method, e.g. bank_transfer -> Bank Transfer."""
    if not method:
        return "N/A"
    value = method.value if hasattr(method, "value") else str(method)
    special = {"telebirr": "TeleBirr", "cbe_birr": "CBE Birr"}
    return special.get(value, value.replace("_", " ").title())


def format_date(dt: datetime) -> str:
    """Format a true instant (created_at, a payment time) for documents."""
    return _to_local(dt).strftime("%B %d, %Y")


def format_datetime(dt: datetime) -> str:
    """Format a true instant with time for documents."""
    return _to_local(dt).strftime("%B %d, %Y at %I:%M %p")


def format_business_datetime(dt: datetime | None) -> str:
    """Format a business date — pickup, return, inspection — as stored.

    These are local wall-clock values with no offset. Running them through
    _to_local, which assumes a naive value is UTC, printed every pickup and
    return three hours late: a 09:00 pickup came out as 12:00 PM.
    """
    if dt is None:
        return "—"
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)
    return dt.strftime("%B %d, %Y at %I:%M %p")


def _customer_address(customer: Customer) -> str:
    parts = [customer.house_number, customer.wereda, customer.subcity, customer.city]
    return ", ".join(p for p in parts if p) or "—"


# ---------------------------------------------------------------------------
# HTML rendering
#
# Documents used to be .txt files that the admin app downloaded, so there was
# nothing to print or sign. They are now self-contained HTML that a browser
# prints or saves as PDF, with no extra dependency.
#
# The page opens on the admin app's origin, so every value is escaped by
# _e(). An unescaped customer name or note could otherwise run script with a
# staff session token in reach.
# ---------------------------------------------------------------------------

from html import escape as _escape


def _e(value) -> str:
    return _escape("" if value is None else str(value), quote=True)


_STYLE = """
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, "Segoe UI", "Noto Sans Ethiopic", Arial, sans-serif;
         color: #1a1a1a; margin: 0; padding: 32px 16px; background: #f4f4f2; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px 44px;
          border: 1px solid #ddd; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 22px; gap: 16px; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: .02em; }
  .muted { color: #666; }
  .ref { text-align: right; font-size: 12px; }
  .ref strong { display: block; font-size: 14px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #555;
       border-bottom: 1px solid #e3e3e3; padding-bottom: 4px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 4px 0; vertical-align: top; }
  td.k { width: 38%; color: #555; }
  .grid th { font-size: 11px; color: #555; border-bottom: 1px solid #e3e3e3; padding: 6px 4px; }
  .grid td { padding: 6px 4px; border-bottom: 1px solid #f0f0f0; }
  .total td { font-weight: 700; border-top: 1px solid #1a1a1a; padding-top: 8px; }
  ol { margin: 0; padding-left: 18px; } li { margin: 3px 0; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 40px; }
  .sign div { border-top: 1px solid #1a1a1a; padding-top: 6px; font-size: 12px; color: #555; }
  .toolbar { max-width: 760px; margin: 0 auto 12px; text-align: right; }
  .toolbar button { font: inherit; padding: 8px 18px; border: 1px solid #1a1a1a;
                    background: #1a1a1a; color: #fff; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { border: 0; padding: 0; max-width: none; }
    .toolbar { display: none; }
    @page { margin: 16mm; }
  }
"""


def _rows(pairs: list[tuple[str, object]]) -> str:
    return "".join(f'<tr><td class="k">{_e(k)}</td><td>{_e(v)}</td></tr>' for k, v in pairs)


def _section(title: str, body: str) -> str:
    return f"<h2>{_e(title)}</h2>{body}"


def _page(title: str, reference: str, subtitle: str, body: str, signatures: tuple[str, str]) -> str:
    left, right = signatures
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{_e(title)} — {_e(reference)}</title>
<style>{_STYLE}</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print or save as PDF</button></div>
<main class="page">
  <header>
    <div><h1>{_e(title)}</h1><div class="muted">Nod Car Rent · Addis Ababa</div></div>
    <div class="ref"><strong>{_e(reference)}</strong>{_e(subtitle)}</div>
  </header>
  {body}
  <div class="sign"><div>{_e(left)} — signature &amp; date</div><div>{_e(right)} — signature &amp; date</div></div>
</main>
</body>
</html>
"""


def _write(filename: str, content: str) -> Path:
    filepath = OUTPUT_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    return filepath


def generate_agreement_document(
    db: Session,
    agreement_id: int,
    template_name: str = "rental_agreement",
) -> dict:
    """Generate a printable rental agreement."""
    from src.services import agreement_service

    ensure_output_dir()

    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")

    customer = agreement.customer

    vehicle_info = "—"
    if agreement.vehicle_segments:
        vehicle = agreement.vehicle_segments[0].vehicle
        vehicle_info = f"{vehicle.make} {vehicle.model} ({vehicle.year}) — {vehicle.plate_number}"

    # The shared breakdown, as every other screen and the receipt use. The
    # signed row sum this used before nets the held deposit off the total,
    # so the agreement read 5,000 lower than the header and the ledger tab.
    breakdown = agreement_service.get_balance_breakdown(db, agreement_id)

    body = _section(
        "Customer",
        "<table>" + _rows([
            ("Name", customer.full_name),
            ("Phone", customer.phone_primary),
            ("ID", f"{customer.id_type or '—'} {customer.id_number or ''}".strip()),
            ("Address", _customer_address(customer)),
        ]) + "</table>",
    )

    # A with-driver agreement that never named the driver left nobody
    # accountable for the car on paper.
    if agreement.driver is not None:
        d = agreement.driver
        body += _section(
            "Driver",
            "<table>" + _rows([
                ("Name", d.full_name),
                ("Phone", d.phone_primary),
                ("Licence", f"{d.license_number}" + (f" (class {d.license_class})" if d.license_class else "")),
            ]) + "</table>",
        )

    body += _section("Vehicle", "<table>" + _rows([("Vehicle", vehicle_info)]) + "</table>")
    body += _section(
        "Rental period",
        "<table>" + _rows([
            ("Pickup", format_business_datetime(agreement.pickup_datetime)),
            ("Pickup location", agreement.pickup_location or "Office"),
            ("Return", format_business_datetime(agreement.expected_return_datetime)),
            ("Return location", agreement.return_location or "Office"),
        ]) + "</table>",
    )
    body += _section(
        "Charges",
        "<table>" + _rows([
            ("Daily rate", format_currency(agreement.agreed_daily_rate)),
            ("Security deposit", format_currency(agreement.deposit_amount or Decimal("0"))),
            ("Total charges", format_currency(breakdown["total_charges"])),
            ("Paid", format_currency(breakdown["total_payments"])),
        ]) + f'<tr class="total"><td class="k">Balance due</td><td>{_e(format_currency(breakdown["balance_due"]))}</td></tr>'
        + "</table>",
    )
    body += _section(
        "Terms",
        "<ol>"
        "<li>The renter will return the vehicle in the condition it was received.</li>"
        "<li>The renter is responsible for traffic violations during the rental.</li>"
        "<li>Fuel is to be returned at the pickup level.</li>"
        "<li>Any damage must be reported immediately.</li>"
        "<li>The deposit is refunded on satisfactory return of the vehicle.</li>"
        "<li>Late returns incur additional charges at 1.5× the daily rate.</li>"
        "</ol>",
    )
    if agreement.notes:
        body += _section("Notes", f"<p>{_e(agreement.notes)}</p>")

    content = _page(
        "Car Rental Agreement",
        agreement.agreement_number,
        f"{agreement.agreement_type.value.replace('_', ' ')} · {agreement.status.value.replace('_', ' ')} · "
        f"issued {format_date(agreement.created_at)}",
        body,
        ("Renter", "For Nod Car Rent"),
    )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{agreement.agreement_number}_{timestamp}.html"
    filepath = _write(filename, content)
    logger.info(f"Generated agreement document: {filepath}")

    return {
        "filename": filename,
        "filepath": str(filepath),
        "agreement_id": agreement_id,
        "agreement_number": agreement.agreement_number,
        "generated_at": datetime.now().isoformat(),
    }


def generate_receipt(
    db: Session,
    agreement_id: int,
    payment_id: Optional[int] = None,
) -> dict:
    """Generate a printable payment receipt."""
    ensure_output_dir()

    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")

    customer = agreement.customer
    entries = ledger_service.get_ledger_entries(db, agreement_id)

    # A receipt must show the balance the rest of the system reports.
    # get_agreement_balance is the signed sum of every row, which nets the
    # held deposit off the total, so the receipt read 5,000 low against the
    # header, the ledger tab and /ledger/{id}/balance.
    from src.services import agreement_service

    balance = agreement_service.get_balance_breakdown(db, agreement_id)["balance_due"]

    # Only an actual payment can be receipted. Selecting on amount < 0 also
    # matched deposits, applied deposits and negative adjustments — a -300
    # discount was issued as a 300 payment receipt.
    reversed_ids = {e.reversed_entry_id for e in entries if e.reversed_entry_id is not None}
    payment_entries = [
        e
        for e in entries
        if e.entry_type == LedgerEntryType.PAYMENT and e.id not in reversed_ids
    ]

    if payment_id:
        payment = next((e for e in payment_entries if e.id == payment_id), None)
        if not payment:
            raise BusinessError(
                ErrorCode.INVALID_INPUT,
                "That entry is not a payment, or it has been reversed",
            )
    else:
        payment = payment_entries[-1] if payment_entries else None

    if not payment:
        raise BusinessError(
            ErrorCode.INVALID_INPUT, "No payment on this agreement to receipt"
        )

    body = _section(
        "Received from",
        "<table>" + _rows([
            ("Customer", customer.full_name),
            ("Phone", customer.phone_primary),
            ("Agreement", agreement.agreement_number),
        ]) + "</table>",
    )
    body += _section(
        "Payment",
        "<table>"
        + f'<tr class="total"><td class="k">Amount paid</td><td>{_e(format_currency(abs(payment.amount)))}</td></tr>'
        + _rows([
            ("Method", format_payment_method(payment.payment_method)),
            ("Reference", payment.payment_reference or "—"),
            ("Received", format_datetime(payment.created_at)),
            ("Remaining balance", format_currency(balance)),
        ])
        + "</table>",
    )
    body += "<p class='muted' style='margin-top:20px'>Thank you for your payment.</p>"

    content = _page(
        "Payment Receipt",
        f"Receipt #{payment.id}",
        f"issued {format_datetime(datetime.now(timezone.utc))}",
        body,
        ("Received by", "Customer"),
    )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"receipt_{agreement.agreement_number}_{timestamp}.html"
    filepath = _write(filename, content)
    logger.info(f"Generated receipt: {filepath}")

    return {
        "filename": filename,
        "filepath": str(filepath),
        "agreement_id": agreement_id,
        "payment_id": payment.id,
        "generated_at": datetime.now().isoformat(),
    }


def generate_inspection_report(
    db: Session,
    inspection_id: int,
) -> dict:
    """Generate a printable inspection report."""
    from src.models.inspection import Inspection

    ensure_output_dir()

    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise ValueError("Inspection not found")

    vehicle = inspection.vehicle

    checklist_rows = "".join(
        f"<tr><td>{_e(item_id)}</td><td>{_e(result.get('status', '—'))}</td>"
        f"<td>{_e(result.get('notes', ''))}</td></tr>"
        for item_id, result in (inspection.checklist_results or {}).items()
    )
    damage_rows = "".join(
        f"<tr><td>{_e(d.get('category', '—'))}</td><td>{_e(d.get('location', '—'))}</td>"
        f"<td>{_e(d.get('severity', '—'))}</td><td>{_e(d.get('description', ''))}</td>"
        f"<td>{_e(format_currency(Decimal(str(d.get('estimated_cost', 0) or 0))))}</td></tr>"
        for d in (inspection.damage_records or [])
    )

    body = _section(
        "Vehicle",
        "<table>" + _rows([
            ("Vehicle", f"{vehicle.make} {vehicle.model} ({vehicle.year})"),
            ("Plate", vehicle.plate_number),
            ("Mileage", f"{inspection.mileage} km" if inspection.mileage is not None else "—"),
            ("Fuel level", f"{inspection.fuel_level}%" if inspection.fuel_level is not None else "—"),
        ]) + "</table>",
    )
    body += _section(
        "People",
        "<table>" + _rows([
            ("Inspector", inspection.inspector_name or "—"),
            ("Customer present", inspection.customer_name or "—"),
        ]) + "</table>",
    )
    body += _section(
        "Checklist",
        f'<table class="grid"><tr><th>Item</th><th>Result</th><th>Notes</th></tr>{checklist_rows}</table>'
        if checklist_rows else "<p class='muted'>No checklist items recorded.</p>",
    )
    body += _section(
        "Damage",
        '<table class="grid"><tr><th>Type</th><th>Location</th><th>Severity</th>'
        f"<th>Description</th><th>Est. cost</th></tr>{damage_rows}</table>"
        if damage_rows else "<p class='muted'>No damage recorded.</p>",
    )
    body += _section(
        "Assessment",
        "<table>" + _rows([
            ("Condition", f"{inspection.condition_rating}/5" if inspection.condition_rating else "—"),
            ("Notes", inspection.notes or "—"),
        ]) + "</table>",
    )

    content = _page(
        "Vehicle Inspection Report",
        f"Inspection #{inspection.id}",
        f"{str(inspection.inspection_type).replace('_', ' ')} · "
        f"{format_business_datetime(inspection.inspection_datetime)}",
        body,
        ("Inspector", "Customer"),
    )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inspection_{inspection.id}_{timestamp}.html"
    filepath = _write(filename, content)
    logger.info(f"Generated inspection report: {filepath}")

    return {
        "filename": filename,
        "filepath": str(filepath),
        "inspection_id": inspection_id,
        "generated_at": datetime.now().isoformat(),
    }


def list_generated_documents(agreement_id: Optional[int] = None) -> list[dict]:
    """List generated documents, optionally filtered by agreement."""
    ensure_output_dir()
    
    documents = []
    for file in OUTPUT_DIR.iterdir():
        if file.is_file():
            doc_info = {
                "filename": file.name,
                "filepath": str(file),
                "size": file.stat().st_size,
                "created_at": datetime.fromtimestamp(file.stat().st_ctime).isoformat(),
            }
            
            # Filter by agreement if specified
            if agreement_id:
                if f"AGR-" in file.name or f"WED-" in file.name:
                    documents.append(doc_info)
            else:
                documents.append(doc_info)
    
    return sorted(documents, key=lambda x: x["created_at"], reverse=True)
