#!/usr/bin/env bash
# dev.sh — manage backend and frontend dev servers
#
# Usage:
#   ./dev.sh start      — start both
#   ./dev.sh stop       — stop both
#   ./dev.sh restart    — restart both
#   ./dev.sh start:be   — backend only
#   ./dev.sh start:fe   — frontend only
#   ./dev.sh stop:be    — stop backend only
#   ./dev.sh stop:fe    — stop frontend only
#   ./dev.sh restart:be — restart backend only
#   ./dev.sh restart:fe — restart frontend only
#   ./dev.sh status     — show what is running
#   ./dev.sh logs:be    — tail backend logs
#   ./dev.sh logs:fe    — tail frontend logs

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

PID_DIR="$ROOT/.pids"
BE_PID="$PID_DIR/backend.pid"
FE_PID="$PID_DIR/frontend.pid"
LOG_DIR="$ROOT/.logs"
BE_LOG="$LOG_DIR/backend.log"
FE_LOG="$LOG_DIR/frontend.log"

BE_PORT=8001
FE_PORT=3000

mkdir -p "$PID_DIR" "$LOG_DIR"

# ── helpers ─────────────────────────────────────────────────────────────────

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

stop_process() {
  local name="$1"
  local pid_file="$2"
  if is_running "$pid_file"; then
    local pid
    pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null && sleep 0.5
    # escalate if still alive
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$pid_file"
    green "  ✓ $name stopped (pid $pid)"
  else
    yellow "  – $name was not running"
    rm -f "$pid_file"
  fi
}

# ── backend ──────────────────────────────────────────────────────────────────

start_backend() {
  if is_running "$BE_PID"; then
    yellow "  – backend already running (pid $(cat "$BE_PID"))"
    return
  fi

  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    red "  ✗ No .venv found in backend/. Run: python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt"
    exit 1
  fi

  # run migrations silently before starting
  (cd "$BACKEND_DIR" && .venv/bin/alembic upgrade head >> "$BE_LOG" 2>&1) || true

  (
    cd "$BACKEND_DIR"
    .venv/bin/uvicorn src.api.main:create_app \
      --factory \
      --reload \
      --host 127.0.0.1 \
      --port "$BE_PORT" \
      >> "$BE_LOG" 2>&1 &
    echo $! > "$BE_PID"
  )
  sleep 1
  if is_running "$BE_PID"; then
    green "  ✓ backend started  →  http://127.0.0.1:$BE_PORT  (logs: .logs/backend.log)"
  else
    red "  ✗ backend failed to start — check .logs/backend.log"
    exit 1
  fi
}

stop_backend() {
  stop_process "backend" "$BE_PID"
}

# ── frontend ─────────────────────────────────────────────────────────────────

start_frontend() {
  if is_running "$FE_PID"; then
    yellow "  – frontend already running (pid $(cat "$FE_PID"))"
    return
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    red "  ✗ node_modules missing. Run: cd frontend && npm install"
    exit 1
  fi

  (
    cd "$FRONTEND_DIR"
    npm run dev >> "$FE_LOG" 2>&1 &
    echo $! > "$FE_PID"
  )
  sleep 2
  if is_running "$FE_PID"; then
    green "  ✓ frontend started →  http://localhost:$FE_PORT  (logs: .logs/frontend.log)"
  else
    red "  ✗ frontend failed to start — check .logs/frontend.log"
    exit 1
  fi
}

stop_frontend() {
  stop_process "frontend" "$FE_PID"
}

# ── commands ─────────────────────────────────────────────────────────────────

cmd_start() {
  bold "Starting services…"
  start_backend
  start_frontend
  echo ""
  green "Both services are up."
  echo "  Backend  →  http://127.0.0.1:$BE_PORT"
  echo "  API docs →  http://127.0.0.1:$BE_PORT/docs"
  echo "  Frontend →  http://localhost:$FE_PORT"
}

cmd_stop() {
  bold "Stopping services…"
  stop_backend
  stop_frontend
  green "Done."
}

cmd_restart() {
  bold "Restarting services…"
  stop_backend
  stop_frontend
  sleep 0.5
  start_backend
  start_frontend
  echo ""
  green "Both services restarted."
}

cmd_status() {
  bold "Service status:"
  if is_running "$BE_PID"; then
    green "  ✓ backend   running  (pid $(cat "$BE_PID"))  →  http://127.0.0.1:$BE_PORT"
  else
    red   "  ✗ backend   stopped"
  fi
  if is_running "$FE_PID"; then
    green "  ✓ frontend  running  (pid $(cat "$FE_PID"))  →  http://localhost:$FE_PORT"
  else
    red   "  ✗ frontend  stopped"
  fi
}

# ── dispatch ─────────────────────────────────────────────────────────────────

case "${1:-help}" in
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  restart)    cmd_restart ;;
  status)     cmd_status ;;
  start:be)   bold "Starting backend…";  start_backend ;;
  start:fe)   bold "Starting frontend…"; start_frontend ;;
  stop:be)    bold "Stopping backend…";  stop_backend ;;
  stop:fe)    bold "Stopping frontend…"; stop_frontend ;;
  restart:be) bold "Restarting backend…";  stop_backend;  sleep 0.5; start_backend ;;
  restart:fe) bold "Restarting frontend…"; stop_frontend; sleep 0.5; start_frontend ;;
  logs:be)    tail -f "$BE_LOG" ;;
  logs:fe)    tail -f "$FE_LOG" ;;
  *)
    bold "Usage: ./dev.sh <command>"
    echo ""
    echo "  start          start both backend and frontend"
    echo "  stop           stop both"
    echo "  restart        restart both"
    echo "  status         show running status"
    echo ""
    echo "  start:be       start backend only"
    echo "  start:fe       start frontend only"
    echo "  stop:be        stop backend only"
    echo "  stop:fe        stop frontend only"
    echo "  restart:be     restart backend only"
    echo "  restart:fe     restart frontend only"
    echo ""
    echo "  logs:be        tail backend logs"
    echo "  logs:fe        tail frontend logs"
    ;;
esac
