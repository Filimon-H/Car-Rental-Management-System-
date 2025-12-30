"""Seed script to create database tables and initial admin user."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import bcrypt

from src.core.db import Base, engine, SessionLocal
from src.models import *  # Import all models to register them
from src.models.staff_user import StaffUser
from src.core.rbac import Role


def hash_password_direct(password: str) -> str:
    """Hash password using bcrypt directly."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_tables():
    """Create all database tables."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully!")


def seed_admin():
    """Create initial admin user."""
    db = SessionLocal()
    try:
        # Check if admin already exists
        existing = db.query(StaffUser).filter(StaffUser.username == "admin").first()
        if existing:
            print("✓ Admin user already exists")
            return
        
        # Create admin user
        admin = StaffUser(
            username="admin",
            email="admin@carrental.local",
            full_name="System Administrator",
            role=Role.ADMIN,
            is_active=True,
            hashed_password=hash_password_direct("admin123"),  # Change this in production!
        )
        
        db.add(admin)
        db.commit()
        print("✓ Admin user created!")
        print("  Username: admin")
        print("  Password: admin123")
        print("  ⚠️  Change this password in production!")
        
    finally:
        db.close()


def main():
    print("\n=== Car Rental Database Setup ===\n")
    create_tables()
    seed_admin()
    print("\n✓ Setup complete!\n")


if __name__ == "__main__":
    main()
