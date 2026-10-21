#!/bin/sh
# Start a backend on a fresh, throwaway database for the end-to-end suite.
# Never touches backend/car_rental.db.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$HERE/../backend"
DB="$HERE/.tmp/e2e.db"
mkdir -p "$HERE/.tmp"
rm -f "$DB" "$DB-wal" "$DB-shm"

export DATABASE_URL="sqlite:///$DB"
export TELEGRAM_BOT_ENABLED=false
export SCHEDULER_ENABLED=false
export SEED_PASSWORD_ADMIN="${E2E_ADMIN_PASSWORD:-e2e-admin-pass}"
# The bot stays off; its name is only used to build the "Confirm on Telegram" link.
export TELEGRAM_BOT_USERNAME=NodE2EBot
export PUBLIC_SITE_URL="http://localhost:${E2E_LANDING_PORT:-5274}"

cd "$BACKEND"
.venv/bin/alembic upgrade head >/dev/null
.venv/bin/python "$HERE/scripts/seed.py"
exec .venv/bin/uvicorn src.api.main:create_app --factory --host 127.0.0.1 --port "${E2E_API_PORT:-8101}"
