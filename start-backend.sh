#!/usr/bin/env bash
# ============================================================
#  start-backend.sh — Start all backend services in parallel
#  Services: engine | db-puller | server | ws-server | spotPrice-feeder
# ============================================================

set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║        PERPS TURBO — Backend Services            ║"
echo "  ║  engine | db-puller | server | ws-server | feed  ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Track child PIDs for cleanup on exit
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}[shutdown] Stopping all backend services...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
    fi
  done
  echo -e "${GREEN}[shutdown] All services stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Helper to run a service with a labelled prefix
run_service() {
  local label="$1"
  local color="$2"
  local cmd="$3"
  shift 3

  (
    while true; do
      echo -e "${color}[${label}] Starting...${NC}"
      eval "$cmd" 2>&1 | while IFS= read -r line; do
        echo -e "${color}[${label}]${NC} $line"
      done
      EXIT_CODE=${PIPESTATUS[0]}
      if [ "$EXIT_CODE" -ne 0 ]; then
        echo -e "${RED}[${label}] Exited with code $EXIT_CODE. Restarting in 3s...${NC}"
        sleep 3
      else
        echo -e "${YELLOW}[${label}] Exited cleanly.${NC}"
        break
      fi
    done
  ) &
  PIDS+=($!)
}

# ── Start each backend service ─────────────────────────────

run_service "engine      " "$GREEN"   "bun run --hot apps/engine/index.ts"
sleep 0.3

run_service "db-puller   " "$CYAN"    "bun run --hot apps/db-puller/index.ts"
sleep 0.3

run_service "server      " "$MAGENTA" "bun run --hot apps/server/src/index.ts"
sleep 0.3

run_service "ws-server   " "$YELLOW"  "bun run --hot apps/ws-server/index.ts"
sleep 0.3

run_service "spot-feeder " "$RED"     "bun run --hot apps/spotPrice-feeder/index.ts"

echo -e "\n${BOLD}${GREEN}✓ All backend services launched.${NC}"
echo -e "${CYAN}  • API Server  → http://localhost:3000"
echo -e "  • WS Server   → ws://localhost:3002${NC}\n"

# Wait for all children
wait
