#!/usr/bin/env bash
# ============================================================
#  start-simulator.sh — Start the continuous HFT simulator
#  Creates 5 synthetic traders placing orders in a loop
# ============================================================

set -e

# ANSI color codes
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BOLD}${YELLOW}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║      PERPS TURBO — HFT Simulation Engine         ║"
echo "  ║   5 synthetic traders • continuous order flow    ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${MAGENTA}[simulator] Requires backend to be running on port 3000.${NC}"
echo -e "${YELLOW}[simulator] Starting continuous simulation...${NC}\n"

cleanup() {
  echo -e "\n${GREEN}[simulator] Stopping HFT simulator...${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Auto-restart on crash
while true; do
  bun run --hot apps/simulator/index.ts 2>&1
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo -e "${RED}[simulator] Crashed (exit $EXIT_CODE). Restarting in 5 seconds...${NC}"
    sleep 5
  else
    echo -e "${GREEN}[simulator] Exited cleanly.${NC}"
    break
  fi
done
