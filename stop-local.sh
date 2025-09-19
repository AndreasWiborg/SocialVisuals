#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

echo "Stopping Text Overlay System..."
echo "=============================="

graceful_kill() {
  local pid="$1"; shift
  local name="$1"; shift
  if [ -z "$pid" ]; then return 0; fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then return 0; fi
  kill "$pid" 2>/dev/null || true
  for i in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name stopped (PID $pid)"
      return 0
    fi
    sleep 0.3
  done
  echo "Forcing $name to stop (PID $pid)"
  kill -9 "$pid" 2>/dev/null || true
}

kill_by_port() {
  local port="$1"; shift
  local name="$1"; shift
  local pids
  pids=$(lsof -ti:"$port" || true)
  if [ -n "${pids:-}" ]; then
    echo "Stopping $name on port $port..."
    for p in $pids; do
      graceful_kill "$p" "$name"
    done
  else
    echo "$name not running on port $port"
  fi
}

# Prefer PID files when available
if [ -f text-overlay/.backend.pid ]; then
  API_PID=$(cat text-overlay/.backend.pid || true)
else
  API_PID=""
fi
if [ -n "${API_PID:-}" ]; then
  echo "Stopping Text-Overlay API (PID file)..."
  graceful_kill "$API_PID" "Text-Overlay API" || true
  rm -f text-overlay/.backend.pid || true
else
  kill_by_port 3000 "Text-Overlay API"
fi

if [ -f frontend/.frontend.pid ]; then
  FRONT_PID=$(cat frontend/.frontend.pid || true)
else
  FRONT_PID=""
fi
if [ -n "${FRONT_PID:-}" ]; then
  echo "Stopping Frontend (PID file)..."
  graceful_kill "$FRONT_PID" "Frontend" || true
  rm -f frontend/.frontend.pid || true
else
  kill_by_port 3001 "Frontend"
fi

echo ""
echo "All services stopped!"
