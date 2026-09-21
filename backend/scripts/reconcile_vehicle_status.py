"""Report vehicle-status drift; writes require --apply.

Run from backend/: python scripts/reconcile_vehicle_status.py [--dry-run | --apply]
Uses the configured DATABASE_URL. Maintenance/inactive holds are preserved.
Run during a maintenance window when applying changes to avoid concurrent
agreement transitions. No agreements or segments are modified.
"""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session

from src.models.vehicle import Vehicle
from src.services.vehicle_status_service import expected_vehicle_status


def reconcile(db: Session, *, dry_run: bool = True) -> int:
    """Print each difference and commit changes only when explicitly requested."""
    changes = []
    for vehicle in db.query(Vehicle).order_by(Vehicle.id).all():
        expected = expected_vehicle_status(db, vehicle)
        if vehicle.status != expected:
            print(f"{vehicle.id} {vehicle.plate_number}: {vehicle.status.value} -> {expected.value}")
            changes.append((vehicle, expected))
    if not dry_run:
        for vehicle, expected in changes:
            vehicle.status = expected
        db.commit()
    print(f"{'DRY RUN' if dry_run else 'APPLIED'}: {len(changes)} vehicle(s) "
          f"{'would change; no writes made' if dry_run else 'updated'}")
    return len(changes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', help='Report only (default)')
    mode.add_argument('--apply', action='store_true', help='Persist corrected vehicle statuses')
    args = parser.parse_args()
    import src.models  # noqa: F401 — register all model relationships
    from src.core.db import SessionLocal

    with SessionLocal() as db:
        reconcile(db, dry_run=not args.apply)


if __name__ == '__main__':
    main()
