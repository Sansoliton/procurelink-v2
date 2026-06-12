#!/bin/bash
echo "========================================"
echo " ProcureLink v2 - Local Dev Startup"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Check venv exists ─────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.venv/bin/activate" ]; then
    echo "[ERROR] Python venv not found."
    echo "        Run:  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# ── Check node_modules exists ─────────────────────────────────
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "[ERROR] Node modules not found."
    echo "        Run:  cd frontend && npm install"
    exit 1
fi

# ── Start Backend ─────────────────────────────────────────────
echo "[1/2] Starting backend API (port 2000)..."
osascript -e "tell app \"Terminal\" to do script \"cd '$SCRIPT_DIR/backend' && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 2000 --reload\""

# Small pause so backend is up before frontend tries to connect
sleep 2

# ── Start Frontend ────────────────────────────────────────────
echo "[2/2] Starting frontend dev server (port 5173)..."
osascript -e "tell app \"Terminal\" to do script \"cd '$SCRIPT_DIR/frontend' && npm run dev\""

echo ""
echo "========================================"
echo " Services starting in separate windows:"
echo ""
echo "   Frontend     : http://localhost:5173"
echo "   Backend API  : http://localhost:2000"
echo "   API Docs     : http://localhost:2000/docs"
echo ""
echo " Production URL (after deploy):"
echo "   App          : https://quotme.sanvx.online"
echo "   API Docs     : https://quotme.sanvx.online/api/docs"
echo "========================================"
