#!/bin/sh
# Start a backend on a fresh, throwaway database for the end-to-end suite.
# Never touches backend/car_rental.db.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$HERE/../backend"
DB="$HERE/.tmp/e2e-${E2E_API_PORT:-8101}.db"
mkdir -p "$HERE/.tmp"
rm -f "$DB" "$DB-wal" "$DB-shm"

export DATABASE_URL="sqlite:///$DB"
export DEBUG=false
export TELEGRAM_BOT_ENABLED=false
export SCHEDULER_ENABLED=false
# The suite signs up more people a minute than the live limit allows.
export RATE_LIMIT_ENABLED=false
export SEED_PASSWORD_ADMIN="${E2E_ADMIN_PASSWORD:-e2e-admin-pass}"
# Known passwords for the other roles, so permissions can be tested per role.
export SEED_PASSWORD_SALES1="${E2E_SALES_PASSWORD:-e2e-sales-pass}"
export SEED_PASSWORD_FLEET1="${E2E_FLEET_PASSWORD:-e2e-fleet-pass}"
export SEED_PASSWORD_INSPECTOR1="${E2E_INSPECTOR_PASSWORD:-e2e-inspector-pass}"
export SEED_PASSWORD_ACCOUNTANT1="${E2E_ACCOUNTANT_PASSWORD:-e2e-accountant-pass}"
# The bot stays off; its name is only used to build the "Confirm on Telegram" link.
export TELEGRAM_BOT_USERNAME=NodE2EBot
export PUBLIC_SITE_URL="http://localhost:${E2E_LANDING_PORT:-5274}"

cd "$BACKEND"
.venv/bin/alembic upgrade head >/dev/null
.venv/bin/python "$HERE/scripts/seed.py"
exec .venv/bin/uvicorn src.api.main:create_app --factory --host 127.0.0.1 --port "${E2E_API_PORT:-8101}"
