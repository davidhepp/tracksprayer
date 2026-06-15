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

# Print a PID followed by all of its descendants (depth-first), so that the
# whole process tree can be signalled even after children get reparented.
collect_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    collect_tree "$child"
  done
  echo "$pid"
}

cleanup() {
  trap - INT TERM EXIT

  local pids=()
  local root
  for root in "$backend_pid" "$frontend_pid"; do
    if [ -n "$root" ] && kill -0 "$root" 2>/dev/null; then
      pids+=($(collect_tree "$root"))
    fi
  done

  if [ "${#pids[@]}" -gt 0 ]; then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    sleep 1
    kill -KILL "${pids[@]}" 2>/dev/null || true
  fi

  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

# Fail fast if the backend port is occupied; otherwise uvicorn dies on bind and
# the watch loop tears everything down again, leaving orphaned dev servers.
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: port 8000 is already in use. Stop that process and retry." >&2
  exit 1
fi

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
