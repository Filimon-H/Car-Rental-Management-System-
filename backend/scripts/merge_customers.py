"""Merge duplicate customers into one record; writes require --apply.

Run from backend/:
    python scripts/merge_customers.py --keep 3 --merge 19 20            # dry run
    python scripts/merge_customers.py --keep 3 --merge 19 20 --apply

Uses the configured DATABASE_URL. Rentals, collateral people and documents
move to the kept record; the duplicates are deactivated, not deleted. Back
the database up first.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", type=int, required=True, help="Customer id to keep")
    parser.add_argument("--merge", type=int, nargs="+", required=True, help="Duplicate customer ids")
    parser.add_argument("--apply", action="store_true", help="Persist the merge (default: dry run)")
    args = parser.parse_args()

    import src.models  # noqa: F401 — register all model relationships
    from src.core.db import SessionLocal
    from src.services.customer_merge_service import merge_customers

    with SessionLocal() as db:
        summary = merge_customers(db, args.keep, args.merge, commit=args.apply)
        if not args.apply:
            db.rollback()
    print(json.dumps(summary, indent=2, default=str))
    print("APPLIED" if args.apply else "DRY RUN: no writes made")


if __name__ == "__main__":
    main()
