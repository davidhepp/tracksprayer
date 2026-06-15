#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

FRONTEND_CMD=(bun run dev)

if ! command -v bun >/dev/null 2>&1; then
  FRONTEND_CMD=(npm run dev)
fi

backend_pid=""
frontend_pid=""

cleanup() {
  trap - INT TERM EXIT

  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  if [ -n "$frontend_pid" ] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
  echo "Creating backend virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

echo "Installing backend dependencies..."
"$BACKEND_DIR/.venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"

(
  cd "$BACKEND_DIR"
  "$BACKEND_DIR/.venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) &
backend_pid=$!

(
  cd "$FRONTEND_DIR"
  "${FRONTEND_CMD[@]}"
) &
frontend_pid=$!

echo "Backend running on http://localhost:8000 with PID $backend_pid"
echo "Frontend running on the Vite dev server with PID $frontend_pid"
echo "Stopping both services when either process exits."

while true; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    echo "Backend process exited; stopping frontend."
    exit 1
  fi

  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    echo "Frontend process exited; stopping backend."
    exit 1
  fi

  sleep 1
done
