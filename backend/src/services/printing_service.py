"""Printing service for document generation."""

import logging
import os
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

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


def format_date(dt: datetime) -> str:
    """Format datetime for documents."""
    return dt.strftime("%B %d, %Y")


def format_datetime(dt: datetime) -> str:
    """Format datetime with time for documents."""
    return dt.strftime("%B %d, %Y at %I:%M %p")


def generate_agreement_document(
    db: Session,
    agreement_id: int,
    template_name: str = "rental_agreement",
) -> dict:
    """
    Generate a rental agreement document.
    
    Returns dict with document info and path.
    """
    ensure_output_dir()
    
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")
    
    customer = agreement.customer
    
    # Get vehicle info from first segment
    vehicle_info = ""
    if agreement.vehicle_segments:
        segment = agreement.vehicle_segments[0]
        vehicle = segment.vehicle
        vehicle_info = f"{vehicle.make} {vehicle.model} ({vehicle.year}) - {vehicle.plate_number}"
    
    # Calculate totals
    balance = ledger_service.get_agreement_balance(db, agreement_id)
    total_charges = ledger_service.get_total_charges(db, agreement_id)
    total_payments = ledger_service.get_total_payments(db, agreement_id)
    
    # Build document data
    doc_data = {
        "agreement_number": agreement.agreement_number,
        "agreement_type": agreement.agreement_type.value,
        "status": agreement.status.value,
        "created_date": format_date(agreement.created_at),
        
        # Customer info
        "customer_name": customer.full_name,
        "customer_phone": customer.phone_primary,
        "customer_id_type": customer.id_type,
        "customer_id_number": customer.id_number,
        "customer_address": customer.address or "N/A",
        
        # Vehicle info
        "vehicle_info": vehicle_info,
        
        # Dates
        "pickup_datetime": format_datetime(agreement.pickup_datetime),
        "return_datetime": format_datetime(agreement.expected_return_datetime),
        "pickup_location": agreement.pickup_location or "Office",
        "return_location": agreement.return_location or "Office",
        
        # Pricing
        "daily_rate": format_currency(agreement.agreed_daily_rate),
        "deposit": format_currency(agreement.deposit_amount),
        "total_charges": format_currency(total_charges),
        "total_payments": format_currency(total_payments),
        "balance_due": format_currency(balance),
        
        # Notes
        "notes": agreement.notes or "",
    }
    
    # Generate filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{agreement.agreement_number}_{timestamp}.txt"
    filepath = OUTPUT_DIR / filename
    
    # For now, generate a simple text document
    # In production, this would use python-docx or similar
    content = _generate_text_agreement(doc_data)
    
    with open(filepath, "w") as f:
        f.write(content)
    
    logger.info(f"Generated agreement document: {filepath}")
    
    return {
        "filename": filename,
        "filepath": str(filepath),
        "agreement_id": agreement_id,
        "agreement_number": agreement.agreement_number,
        "generated_at": datetime.now().isoformat(),
    }


def _generate_text_agreement(data: dict) -> str:
    """Generate text version of agreement document."""
    return f"""
================================================================================
                        CAR RENTAL AGREEMENT
================================================================================

Agreement Number: {data['agreement_number']}
Agreement Type: {data['agreement_type'].upper()}
Status: {data['status'].upper()}
Date: {data['created_date']}

--------------------------------------------------------------------------------
                            CUSTOMER DETAILS
--------------------------------------------------------------------------------

Name: {data['customer_name']}
Phone: {data['customer_phone']}
ID Type: {data['customer_id_type']}
ID Number: {data['customer_id_number']}
Address: {data['customer_address']}

--------------------------------------------------------------------------------
                            VEHICLE DETAILS
--------------------------------------------------------------------------------

Vehicle: {data['vehicle_info']}

--------------------------------------------------------------------------------
                            RENTAL PERIOD
--------------------------------------------------------------------------------

Pickup: {data['pickup_datetime']}
Location: {data['pickup_location']}

Return: {data['return_datetime']}
Location: {data['return_location']}

--------------------------------------------------------------------------------
                            PRICING DETAILS
--------------------------------------------------------------------------------

Daily Rate: {data['daily_rate']}
Security Deposit: {data['deposit']}

Total Charges: {data['total_charges']}
Total Payments: {data['total_payments']}
Balance Due: {data['balance_due']}

--------------------------------------------------------------------------------
                            TERMS AND CONDITIONS
--------------------------------------------------------------------------------

1. The renter agrees to return the vehicle in the same condition as received.
2. The renter is responsible for all traffic violations during the rental period.
3. Fuel should be returned at the same level as pickup.
4. Any damages must be reported immediately.
5. The deposit will be refunded upon satisfactory vehicle return.
6. Late returns will incur additional charges at 1.5x the daily rate.

--------------------------------------------------------------------------------
                            NOTES
--------------------------------------------------------------------------------

{data['notes'] or 'No additional notes.'}

--------------------------------------------------------------------------------
                            SIGNATURES
--------------------------------------------------------------------------------

Renter: ________________________    Date: ______________

Staff: _________________________    Date: ______________

================================================================================
"""


def generate_receipt(
    db: Session,
    agreement_id: int,
    payment_id: Optional[int] = None,
) -> dict:
    """Generate a payment receipt document."""
    ensure_output_dir()
    
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")
    
    customer = agreement.customer
    balance = ledger_service.get_agreement_balance(db, agreement_id)
    entries = ledger_service.get_ledger_entries(db, agreement_id)
    
    # Get latest payment or specific payment
    payment_entries = [e for e in entries if e.amount < 0]
    if payment_id:
        payment = next((e for e in payment_entries if e.id == payment_id), None)
    else:
        payment = payment_entries[-1] if payment_entries else None
    
    if not payment:
        raise ValueError("No payment found")
    
    # Generate filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"receipt_{agreement.agreement_number}_{timestamp}.txt"
    filepath = OUTPUT_DIR / filename
    
    content = f"""
================================================================================
                          PAYMENT RECEIPT
================================================================================

Receipt Date: {format_datetime(datetime.now())}
Agreement: {agreement.agreement_number}

Customer: {customer.full_name}
Phone: {customer.phone_primary}

--------------------------------------------------------------------------------
                          PAYMENT DETAILS
--------------------------------------------------------------------------------

Amount Paid: {format_currency(abs(payment.amount))}
Payment Method: {payment.payment_method.value if payment.payment_method else 'N/A'}
Reference: {payment.payment_reference or 'N/A'}
Date: {format_datetime(payment.created_at)}

--------------------------------------------------------------------------------

Remaining Balance: {format_currency(balance)}

--------------------------------------------------------------------------------

Thank you for your payment!

================================================================================
"""
    
    with open(filepath, "w") as f:
        f.write(content)
    
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
    """Generate an inspection report document."""
    from src.models.inspection import Inspection
    
    ensure_output_dir()
    
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise ValueError("Inspection not found")
    
    vehicle = inspection.vehicle
    
    # Generate filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inspection_{inspection.id}_{timestamp}.txt"
    filepath = OUTPUT_DIR / filename
    
    # Build checklist results
    checklist_text = ""
    for item_id, result in inspection.checklist_results.items():
        status = result.get("status", "N/A")
        notes = result.get("notes", "")
        checklist_text += f"  - {item_id}: {status}"
        if notes:
            checklist_text += f" ({notes})"
        checklist_text += "\n"
    
    # Build damage records
    damage_text = ""
    for i, damage in enumerate(inspection.damage_records, 1):
        damage_text += f"""
  {i}. {damage.get('category', 'Unknown').upper()}
     Location: {damage.get('location', 'N/A')}
     Severity: {damage.get('severity', 'N/A')}
     Description: {damage.get('description', 'N/A')}
     Est. Cost: {format_currency(Decimal(str(damage.get('estimated_cost', 0))))}
"""
    
    content = f"""
================================================================================
                        VEHICLE INSPECTION REPORT
================================================================================

Inspection ID: {inspection.id}
Type: {inspection.inspection_type.upper()}
Date: {format_datetime(inspection.inspection_datetime)}
Status: {inspection.status.upper()}

--------------------------------------------------------------------------------
                            VEHICLE DETAILS
--------------------------------------------------------------------------------

Vehicle: {vehicle.make} {vehicle.model} ({vehicle.year})
Plate: {vehicle.plate_number}
Mileage: {inspection.mileage or 'N/A'} km
Fuel Level: {inspection.fuel_level or 'N/A'}%

--------------------------------------------------------------------------------
                            INSPECTOR
--------------------------------------------------------------------------------

Name: {inspection.inspector_name or 'N/A'}
Customer Present: {inspection.customer_name or 'N/A'}

--------------------------------------------------------------------------------
                            CHECKLIST RESULTS
--------------------------------------------------------------------------------

{checklist_text or '  No checklist items recorded.'}

--------------------------------------------------------------------------------
                            DAMAGE RECORDS
--------------------------------------------------------------------------------

{damage_text or '  No damage recorded.'}

--------------------------------------------------------------------------------
                            OVERALL ASSESSMENT
--------------------------------------------------------------------------------

Condition Rating: {inspection.condition_rating or 'N/A'}/5
Notes: {inspection.notes or 'No additional notes.'}

--------------------------------------------------------------------------------
                            SIGNATURES
--------------------------------------------------------------------------------

Inspector: ________________________    Date: ______________

Customer: _________________________    Date: ______________

================================================================================
"""
    
    with open(filepath, "w") as f:
        f.write(content)
    
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
