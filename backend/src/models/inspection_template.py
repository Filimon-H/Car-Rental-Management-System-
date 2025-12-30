"""Inspection template model for reusable inspection checklists."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, JSON, func
from sqlalchemy.orm import relationship

from src.core.db import Base


class InspectionTemplate(Base):
    """Inspection template with configurable checklist items."""

    __tablename__ = "inspection_templates"

    id = Column(Integer, primary_key=True, index=True)
    
    # Template info
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Template type: pickup, return, periodic
    template_type = Column(String(20), nullable=False, default="general")
    
    # Checklist items stored as JSON array
    # Format: [{"id": "exterior_front", "label": "Front Exterior", "category": "exterior", "required": true}, ...]
    checklist_items = Column(JSON, nullable=False, default=list)
    
    # Default damage categories for this template
    # Format: ["scratch", "dent", "crack", "stain", "missing", "other"]
    damage_categories = Column(JSON, nullable=False, default=list)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    inspections = relationship("Inspection", back_populates="template")

    def __repr__(self) -> str:
        return f"<InspectionTemplate {self.id}: {self.name}>"


# Default checklist items for vehicle inspections
DEFAULT_VEHICLE_CHECKLIST = [
    {"id": "exterior_front", "label": "Front Bumper & Grille", "category": "exterior", "required": True},
    {"id": "exterior_rear", "label": "Rear Bumper & Trunk", "category": "exterior", "required": True},
    {"id": "exterior_left", "label": "Left Side Panels", "category": "exterior", "required": True},
    {"id": "exterior_right", "label": "Right Side Panels", "category": "exterior", "required": True},
    {"id": "exterior_roof", "label": "Roof", "category": "exterior", "required": True},
    {"id": "exterior_hood", "label": "Hood", "category": "exterior", "required": True},
    {"id": "windshield_front", "label": "Front Windshield", "category": "glass", "required": True},
    {"id": "windshield_rear", "label": "Rear Windshield", "category": "glass", "required": True},
    {"id": "windows_left", "label": "Left Windows", "category": "glass", "required": True},
    {"id": "windows_right", "label": "Right Windows", "category": "glass", "required": True},
    {"id": "mirrors", "label": "Side Mirrors", "category": "glass", "required": True},
    {"id": "headlights", "label": "Headlights", "category": "lights", "required": True},
    {"id": "taillights", "label": "Tail Lights", "category": "lights", "required": True},
    {"id": "indicators", "label": "Turn Indicators", "category": "lights", "required": True},
    {"id": "tires_condition", "label": "Tire Condition", "category": "tires", "required": True},
    {"id": "tire_pressure", "label": "Tire Pressure", "category": "tires", "required": False},
    {"id": "spare_tire", "label": "Spare Tire", "category": "tires", "required": True},
    {"id": "interior_seats", "label": "Seats", "category": "interior", "required": True},
    {"id": "interior_dashboard", "label": "Dashboard", "category": "interior", "required": True},
    {"id": "interior_carpet", "label": "Carpet/Floor Mats", "category": "interior", "required": True},
    {"id": "interior_ac", "label": "Air Conditioning", "category": "interior", "required": True},
    {"id": "interior_audio", "label": "Audio System", "category": "interior", "required": False},
    {"id": "fuel_level", "label": "Fuel Level", "category": "fluids", "required": True},
    {"id": "oil_level", "label": "Oil Level", "category": "fluids", "required": False},
    {"id": "coolant_level", "label": "Coolant Level", "category": "fluids", "required": False},
    {"id": "documents", "label": "Vehicle Documents", "category": "documents", "required": True},
    {"id": "keys", "label": "Keys & Remote", "category": "accessories", "required": True},
    {"id": "jack_tools", "label": "Jack & Tools", "category": "accessories", "required": True},
    {"id": "first_aid", "label": "First Aid Kit", "category": "accessories", "required": False},
    {"id": "fire_extinguisher", "label": "Fire Extinguisher", "category": "accessories", "required": False},
]

DEFAULT_DAMAGE_CATEGORIES = [
    "scratch",
    "dent",
    "crack",
    "chip",
    "stain",
    "tear",
    "missing",
    "broken",
    "worn",
    "other",
]
