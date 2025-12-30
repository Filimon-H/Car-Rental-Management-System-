"""Inspection model for vehicle condition records."""

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, 
    String, Text, JSON, Numeric, func
)
from sqlalchemy.orm import relationship

from src.core.db import Base


class Inspection(Base):
    """Vehicle inspection record."""

    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)
    
    # Link to template
    template_id = Column(Integer, ForeignKey("inspection_templates.id"), nullable=True)
    
    # Link to agreement (optional - can be standalone)
    agreement_id = Column(Integer, ForeignKey("agreements.id"), nullable=True)
    
    # Link to vehicle
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    
    # Inspection type: pickup, return, periodic, damage_report
    inspection_type = Column(String(20), nullable=False)
    
    # Inspection datetime
    inspection_datetime = Column(DateTime(timezone=True), nullable=False)
    
    # Inspector info
    inspector_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    inspector_name = Column(String(100), nullable=True)
    
    # Customer signature (base64 or reference)
    customer_signature = Column(Text, nullable=True)
    customer_name = Column(String(100), nullable=True)
    
    # Mileage at inspection
    mileage = Column(Integer, nullable=True)
    
    # Fuel level (percentage or fraction)
    fuel_level = Column(Numeric(5, 2), nullable=True)
    
    # Checklist results stored as JSON
    # Format: {"exterior_front": {"status": "ok|damage|na", "notes": "", "photos": []}, ...}
    checklist_results = Column(JSON, nullable=False, default=dict)
    
    # Damage records stored as JSON array
    # Format: [{"id": "uuid", "category": "scratch", "location": "front_left", "severity": "minor|moderate|severe", "description": "", "photos": [], "estimated_cost": 0}, ...]
    damage_records = Column(JSON, nullable=False, default=list)
    
    # Overall condition rating (1-5)
    condition_rating = Column(Integer, nullable=True)
    
    # Overall notes
    notes = Column(Text, nullable=True)
    
    # Photo references (JSON array of URLs/paths)
    photos = Column(JSON, nullable=False, default=list)
    
    # Status: draft, completed, signed
    status = Column(String(20), nullable=False, default="draft")
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    template = relationship("InspectionTemplate", back_populates="inspections")
    agreement = relationship("Agreement", back_populates="inspections")
    vehicle = relationship("Vehicle")
    inspector = relationship("StaffUser")

    def __repr__(self) -> str:
        return f"<Inspection {self.id}: {self.inspection_type} for vehicle {self.vehicle_id}>"


class InspectionPhoto(Base):
    """Photo attached to an inspection."""

    __tablename__ = "inspection_photos"

    id = Column(Integer, primary_key=True, index=True)
    
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    
    # File info
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(50), nullable=True)
    
    # Photo metadata
    caption = Column(String(255), nullable=True)
    category = Column(String(50), nullable=True)  # exterior, interior, damage, document
    
    # Link to specific checklist item or damage record
    checklist_item_id = Column(String(50), nullable=True)
    damage_record_id = Column(String(50), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    inspection = relationship("Inspection")

    def __repr__(self) -> str:
        return f"<InspectionPhoto {self.id}: {self.filename}>"
