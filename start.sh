#!/bin/bash
# ============================================================
# OCP Automation UI — 啟動腳本
# 用途：啟動 API 服務（同時提供 Web UI）
# 使用方式：bash start.sh
# 停止服務：按 Ctrl+C
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$BACKEND_DIR/venv"
VARS_DIR="$SCRIPT_DIR/vars"
LOGS_DIR="$SCRIPT_DIR/logs"
AUTOMATION_DIR="$SCRIPT_DIR/automation"
PORT=8000

# ── 顏色 ──
GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "============================================"
echo "  OCP Automation UI"
echo "============================================"
echo ""

# ── 前置確認 ──
if [ ! -d "$VENV_DIR" ]; then
    err "尚未執行初次設定，請先執行：bash setup.sh"
fi

if [ ! -d "$SCRIPT_DIR/frontend/dist" ]; then
    warn "前端尚未建置（UI 可能無法顯示）"
    warn "如需建置請執行：bash setup.sh"
fi

# ── 建立必要目錄 ──
mkdir -p "$VARS_DIR" "$LOGS_DIR"

# ── 取得本機 IP ──
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

# ── 啟動服務 ──
step "啟動 OCP Automation UI (port $PORT)..."
echo ""
log "服務位址：http://${HOST_IP}:${PORT}"
log "API 文件：http://${HOST_IP}:${PORT}/docs"
echo ""
warn "按 Ctrl+C 停止服務"
echo ""

# 啟動 uvicorn（backend + frontend 合併在 port 8000）
SITE_VARS_PATH="$VARS_DIR/site.yml" \
AUTOMATION_DIR="$AUTOMATION_DIR" \
LOG_DIR="$LOGS_DIR" \
IMAGESET_PATH="$AUTOMATION_DIR/yaml/imageset-config.yaml" \
    "$VENV_DIR/bin/uvicorn" main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --app-dir "$BACKEND_DIR"
