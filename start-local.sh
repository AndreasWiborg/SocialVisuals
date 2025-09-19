#!/usr/bin/env bash
set -Eeuo pipefail

# Always run from repo root
cd "$(cd "$(dirname "$0")" && pwd)"

echo "Starting Text Overlay System..."
echo "=============================="

# Stop anything already running to ensure a clean start
if [ -f ./stop-local.sh ]; then
  ./stop-local.sh >/dev/null 2>&1 || true
fi

# Helpers
wait_for_port() {
  local port="$1"; shift
  local name="$1"; shift
  local timeout="${1:-25}"
  local waited=0
  while ! lsof -ti:"$port" >/dev/null 2>&1; do
    sleep 1
    waited=$((waited+1))
    if [ "$waited" -ge "$timeout" ]; then
      echo "[warn] $name didn't open port $port within ${timeout}s"
      return 1
    fi
  done
  return 0
}

log_note() {
  local p="$1"; shift
  if [ -f "$p" ]; then
    echo "Logs: $p"
  else
    echo "Logs (will create on first write): $p"
  fi
}

# Backend (Text-Overlay API)
echo "Starting Text-Overlay API..."
(
  cd text-overlay
  : > Text-Overlay-API.log || true
  if [ -f package.json ]; then
    # Prefer package script when available
    npm start >> Text-Overlay-API.log 2>&1 &
  else
    if [ ! -f dist/api.js ]; then
      echo "[error] text-overlay/dist/api.js not found. Please restore or rebuild backend." | tee -a Text-Overlay-API.log
      exit 1
    fi
    node dist/api.js >> Text-Overlay-API.log 2>&1 &
  fi
  API_PID=$!
  echo "$API_PID" > .backend.pid || true
  echo "Text-Overlay API started (PID: $API_PID)"
  log_note "$(pwd)/Text-Overlay-API.log"
)

# Frontend (Next.js)
echo ""
echo "Starting Frontend..."
(
  cd frontend
  # Ensure deps exist if node_modules is missing
  if [ ! -d node_modules ]; then
    echo "Installing frontend dependencies (node_modules missing)..."
    (npm ci || npm install)
  fi
  : > frontend.log || true
  npm run dev >> frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "$FRONTEND_PID" > .frontend.pid || true
  echo "Frontend started (PID: $FRONTEND_PID)"
  log_note "$(pwd)/frontend.log"
)

# Wait for ports (best-effort)
echo ""
wait_for_port 3000 "Text-Overlay API" 25 || true
wait_for_port 3001 "Frontend" 25 || true

echo ""
echo "=============================="
echo "All services started!"
echo ""
echo "Text-Overlay API: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo "Text Overlay UI: http://localhost:3001/text-overlay"
echo ""
echo "To stop all services, run: ./stop-local.sh"
echo ""
echo "Logs:"
echo "- text-overlay/Text-Overlay-API.log"
echo "- frontend/frontend.log"
