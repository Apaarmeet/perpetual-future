#!/usr/bin/env bash
# ============================================================
#  start-frontend.sh — Start the Next.js trading UI
#  Default port: 3003
# ============================================================

set -e

# ANSI color codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PORT="${PORT:-3003}"

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║        PERPS TURBO — Frontend UI                 ║"
echo "  ║           Next.js App Router                     ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}[frontend] Starting Next.js on port ${PORT}...${NC}\n"

cleanup() {
  echo -e "\n${CYAN}[frontend] Shutting down...${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Run Next.js dev server
bun run --cwd apps/web dev --port "$PORT"
