"""Customer bulk upload API router."""

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.schemas.customer import CustomerCreate

router = APIRouter()


class BulkUploadResult(BaseModel):
    """Result of bulk upload operation."""
    
    total_rows: int
    successful: int
    failed: int
    errors: list[dict]
    created_ids: list[int]


class BulkUploadRowError(BaseModel):
    """Error for a single row in bulk upload."""
    
    row: int
    field: Optional[str] = None
    message: str


# Expected CSV columns
EXPECTED_COLUMNS = [
    "business_type",
    "company_name",
    "tin_number",
    "first_name",
    "last_name",
    "phone_primary",
    "phone_secondary",
    "email",
    "id_type",
    "id_number",
    "driver_license_number",
    "house_number",
    "wereda",
    "subcity",
    "city",
    "notes",
]


def normalize_phone(phone: str) -> str:
    """Normalize Ethiopian phone number to +251 format."""
    if not phone:
        return phone
    cleaned = phone.strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("09") and len(cleaned) == 10:
        return "+251" + cleaned[1:]
    if cleaned.startswith("9") and len(cleaned) == 9:
        return "+251" + cleaned
    return phone


def parse_csv_row(row: dict, row_num: int) -> tuple[Optional[CustomerCreate], list[dict]]:
    """Parse and validate a single CSV row."""
    errors = []
    
    # Required fields
    if not row.get("first_name", "").strip():
        errors.append({"row": row_num, "field": "first_name", "message": "First name is required"})
    if not row.get("last_name", "").strip():
        errors.append({"row": row_num, "field": "last_name", "message": "Last name is required"})
    if not row.get("phone_primary", "").strip():
        errors.append({"row": row_num, "field": "phone_primary", "message": "Primary phone is required"})
    
    # Business type validation
    business_type = row.get("business_type", "individual").strip().lower()
    valid_types = ["individual", "company", "government", "embassy", "ngo", "church"]
    if business_type not in valid_types:
        errors.append({"row": row_num, "field": "business_type", "message": f"Invalid business type. Must be one of: {', '.join(valid_types)}"})
        business_type = "individual"
    
    # For individual, require ID fields
    if business_type == "individual":
        if not row.get("id_number", "").strip():
            errors.append({"row": row_num, "field": "id_number", "message": "ID number is required for individual customers"})
        if not row.get("driver_license_number", "").strip():
            errors.append({"row": row_num, "field": "driver_license_number", "message": "Driver license is required for individual customers"})
    
    # For non-individual, require company name
    if business_type != "individual" and not row.get("company_name", "").strip():
        errors.append({"row": row_num, "field": "company_name", "message": "Company name is required for non-individual customers"})
    
    if errors:
        return None, errors
    
    # Build customer data
    try:
        customer_data = CustomerCreate(
            business_type=business_type,
            company_name=row.get("company_name", "").strip() or None,
            tin_number=row.get("tin_number", "").strip() or None,
            first_name=row.get("first_name", "").strip(),
            last_name=row.get("last_name", "").strip(),
            phone_primary=normalize_phone(row.get("phone_primary", "").strip()),
            phone_secondary=normalize_phone(row.get("phone_secondary", "").strip()) or None,
            email=row.get("email", "").strip() or None,
            id_type=row.get("id_type", "passport").strip() or "passport",
            id_number=row.get("id_number", "").strip() or None,
            driver_license_number=row.get("driver_license_number", "").strip() or None,
            house_number=row.get("house_number", "").strip() or None,
            wereda=row.get("wereda", "").strip() or None,
            subcity=row.get("subcity", "").strip() or None,
            city=row.get("city", "").strip() or "Addis Ababa",
            notes=row.get("notes", "").strip() or None,
        )
        return customer_data, []
    except ValidationError as e:
        for err in e.errors():
            errors.append({
                "row": row_num,
                "field": err.get("loc", ["unknown"])[0],
                "message": err.get("msg", "Validation error")
            })
        return None, errors


@router.post("/bulk-upload", response_model=BulkUploadResult)
async def bulk_upload_customers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """
    Bulk upload customers from a CSV file.
    
    Expected CSV format with headers:
    business_type, company_name, tin_number, first_name, last_name, phone_primary,
    phone_secondary, email, id_type, id_number, driver_license_number,
    house_number, wereda, subcity, city, notes
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported. Please upload a .csv file."
        )
    
    # Read file content
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File encoding error. Please use UTF-8 encoded CSV."
        )
    
    # Parse CSV
    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except csv.Error as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV parsing error: {str(e)}"
        )
    
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty or has no data rows"
        )
    
    # Validate and create customers
    all_errors = []
    created_ids = []
    successful = 0
    
    for idx, row in enumerate(rows, start=2):  # Start at 2 (row 1 is header)
        customer_data, errors = parse_csv_row(row, idx)
        
        if errors:
            all_errors.extend(errors)
            continue
        
        # Check for duplicate ID number
        if customer_data.id_number:
            existing = db.query(Customer).filter(
                Customer.id_number == customer_data.id_number,
                Customer.is_active == True
            ).first()
            if existing:
                all_errors.append({
                    "row": idx,
                    "field": "id_number",
                    "message": f"Customer with ID number '{customer_data.id_number}' already exists"
                })
                continue
        
        # Create customer
        try:
            customer = Customer(
                business_type=customer_data.business_type,
                company_name=customer_data.company_name,
                tin_number=customer_data.tin_number,
                first_name=customer_data.first_name,
                last_name=customer_data.last_name,
                phone_primary=customer_data.phone_primary,
                phone_secondary=customer_data.phone_secondary,
                email=customer_data.email,
                id_type=customer_data.id_type,
                id_number=customer_data.id_number,
                license_number=customer_data.driver_license_number,
                house_number=customer_data.house_number,
                wereda=customer_data.wereda,
                subcity=customer_data.subcity,
                city=customer_data.city,
                notes=customer_data.notes,
            )
            db.add(customer)
            db.flush()  # Get ID without committing
            created_ids.append(customer.id)
            successful += 1
        except Exception as e:
            all_errors.append({
                "row": idx,
                "field": None,
                "message": f"Database error: {str(e)}"
            })
    
    # Commit all successful creates
    if successful > 0:
        db.commit()
    
    return BulkUploadResult(
        total_rows=len(rows),
        successful=successful,
        failed=len(rows) - successful,
        errors=all_errors[:50],  # Limit errors to first 50
        created_ids=created_ids,
    )


@router.get("/bulk-upload/template")
async def get_bulk_upload_template(
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Get a sample CSV template for bulk upload."""
    from fastapi.responses import StreamingResponse
    
    # Create sample CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    writer.writerow(EXPECTED_COLUMNS)
    
    # Sample rows
    writer.writerow([
        "individual",  # business_type
        "",  # company_name (empty for individual)
        "",  # tin_number
        "John",  # first_name
        "Doe",  # last_name
        "0911234567",  # phone_primary
        "",  # phone_secondary
        "john.doe@email.com",  # email
        "passport",  # id_type
        "EP1234567",  # id_number
        "DL123456",  # driver_license_number
        "123",  # house_number
        "05",  # wereda
        "Bole",  # subcity
        "Addis Ababa",  # city
        "Sample customer",  # notes
    ])
    writer.writerow([
        "company",  # business_type
        "ABC Corporation",  # company_name
        "1234567890",  # tin_number
        "Jane",  # first_name (contact person)
        "Smith",  # last_name
        "0922345678",  # phone_primary
        "",  # phone_secondary
        "jane@abccorp.com",  # email
        "",  # id_type (not required for company)
        "",  # id_number
        "",  # driver_license_number
        "456",  # house_number
        "03",  # wereda
        "Kirkos",  # subcity
        "Addis Ababa",  # city
        "Corporate client",  # notes
    ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customer_upload_template.csv"}
    )
