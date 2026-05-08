"""Seed script for default lookup values."""

from sqlalchemy.orm import Session
from src.core.db import SessionLocal
from src.models.lookup import LookupValue


DEFAULT_LOOKUPS = {
    "plate_code": [
        {"value": "01", "label": "01"},
        {"value": "02", "label": "02"},
        {"value": "03", "label": "03"},
        {"value": "05", "label": "05"},
        {"value": "daily", "label": "Daily"},
        {"value": "temporary", "label": "Temporary"},
        {"value": "other", "label": "Other"},
    ],
    "service_type": [
        {"value": "business", "label": "Business"},
        {"value": "field_work", "label": "Field Work"},
        {"value": "wedding", "label": "Wedding"},
        {"value": "luxury", "label": "Luxury"},
        {"value": "other", "label": "Other"},
    ],
    "fuel_type": [
        {"value": "petrol", "label": "Petrol"},
        {"value": "diesel", "label": "Diesel"},
        {"value": "hybrid", "label": "Hybrid"},
        {"value": "electric", "label": "Electric"},
        {"value": "other", "label": "Other"},
    ],
    "vehicle_type": [
        {"value": "standard", "label": "Standard"},
        {"value": "compact", "label": "Compact"},
        {"value": "sportcar", "label": "Sport Car"},
        {"value": "luxury", "label": "Luxury"},
        {"value": "pickup", "label": "Pickup"},
        {"value": "van", "label": "Van"},
    ],
    "color": [
        {"value": "black", "label": "Black"},
        {"value": "white", "label": "White"},
        {"value": "red", "label": "Red"},
        {"value": "blue", "label": "Blue"},
        {"value": "green", "label": "Green"},
        {"value": "yellow", "label": "Yellow"},
        {"value": "silver", "label": "Silver"},
        {"value": "gray", "label": "Gray"},
        {"value": "other", "label": "Other"},
    ],
    "car_condition": [
        {"value": "excellent", "label": "Excellent"},
        {"value": "very_good", "label": "Very Good"},
        {"value": "good", "label": "Good"},
        {"value": "not_good", "label": "Not Good"},
        {"value": "risky", "label": "Risky"},
    ],
    "car_model": [
        {"value": "vitz", "label": "Vitz"},
        {"value": "toyota_corolla", "label": "Toyota Corolla"},
        {"value": "pickup", "label": "Pickup"},
        {"value": "suzuki_dzire", "label": "Suzuki Dzire"},
        {"value": "toyota_yaris", "label": "Toyota Yaris"},
        {"value": "hyundai_accent", "label": "Hyundai Accent"},
    ],
    "plate_city": [
        {"value": "AA", "label": "AA"},
        {"value": "Oromiya", "label": "Oromiya"},
        {"value": "Sheger city", "label": "Sheger city"},
    ],
    "make": [
        {"value": "Suzuki", "label": "Suzuki"},
        {"value": "Toyota", "label": "Toyota"},
        {"value": "Honda", "label": "Honda"},
        {"value": "Ford", "label": "Ford"},
        {"value": "Chevrolet", "label": "Chevrolet"},
        {"value": "BMW", "label": "BMW"},
        {"value": "Mercedes-Benz", "label": "Mercedes-Benz"},
        {"value": "Tesla", "label": "Tesla"},
        {"value": "Nissan", "label": "Nissan"},
    ],
}


def seed_lookups(db: Session) -> None:
    """Seed default lookup values."""
    for category, values in DEFAULT_LOOKUPS.items():
        for i, item in enumerate(values):
            existing = (
                db.query(LookupValue)
                .filter(LookupValue.category == category, LookupValue.value == item["value"])
                .first()
            )
            if not existing:
                lookup = LookupValue(
                    category=category,
                    value=item["value"],
                    label=item["label"],
                    sort_order=i,
                    is_active=True,
                )
                db.add(lookup)
    
    db.commit()
    print(f"✓ Seeded lookup values for categories: {', '.join(DEFAULT_LOOKUPS.keys())}")


if __name__ == "__main__":
    print("\n=== Seeding Lookup Values ===\n")
    db = SessionLocal()
    try:
        seed_lookups(db)
        print("\n✓ Lookup values seeded successfully!")
    finally:
        db.close()
