#!/bin/bash
# ============================================================
# OCP Automation UI — 初次設定腳本
# 用途：第一次使用時執行，自動完成所有前置準備
# 使用方式：bash setup.sh
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 顏色 ──
GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "============================================"
echo "  OCP Automation UI — 初次設定"
echo "============================================"
echo ""

# ── Step 1: 確認 Python ──
step "確認 Python 版本..."
PYTHON=""
for cmd in python3.11 python3 python; do
    if command -v "$cmd" &>/dev/null; then
        VER=$($cmd -c "import sys; print(sys.version_info.minor)" 2>/dev/null)
        MAJOR=$($cmd -c "import sys; print(sys.version_info.major)" 2>/dev/null)
        if [ "$MAJOR" = "3" ] && [ "$VER" -ge 9 ] 2>/dev/null; then
            PYTHON="$cmd"
            break
        fi
    fi
done
[ -z "$PYTHON" ] && err "找不到 Python 3.9+，請先安裝：dnf install python3 -y"
log "Python: $($PYTHON --version)"

# ── Step 2: 確認 Git ──
step "確認 Git..."
command -v git &>/dev/null || err "找不到 git，請先安裝：dnf install git -y"
log "Git: $(git --version)"

# ── Step 3: 下載 ocp-automation playbooks ──
step "設定 automation 目錄..."
AUTOMATION_DIR="$SCRIPT_DIR/automation"
if [ -d "$AUTOMATION_DIR/.git" ]; then
    log "automation 已存在，跳過"
elif [ -d "$AUTOMATION_DIR" ] && [ "$(ls -A "$AUTOMATION_DIR" 2>/dev/null)" ]; then
    log "automation 目錄已存在（非 git repo），跳過"
else
    step "Clone ocp-automation repo..."
    git clone https://github.com/Kabiso17/ocp-automation.git "$AUTOMATION_DIR" 2>&1 || {
        warn "無法 clone ocp-automation（可能是 private repo 需要授權）"
        warn "請手動執行：git clone https://github.com/Kabiso17/ocp-automation.git automation"
        mkdir -p "$AUTOMATION_DIR"
    }
fi

# ── Step 4: 建立 vars 目錄 ──
step "建立 vars 目錄..."
mkdir -p "$SCRIPT_DIR/vars"
mkdir -p "$SCRIPT_DIR/logs"
log "vars/ 和 logs/ 目錄已準備"

# ── Step 5: 建立 Python venv ──
step "建立 Python 虛擬環境..."
VENV_DIR="$SCRIPT_DIR/backend/venv"
if [ ! -d "$VENV_DIR" ]; then
    $PYTHON -m venv "$VENV_DIR"
    log "虛擬環境建立完成"
else
    log "虛擬環境已存在，跳過"
fi

# ── Step 6: 安裝 Python 套件 ──
step "安裝 Python 套件..."
"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -r "$SCRIPT_DIR/backend/requirements.txt"
log "Python 套件安裝完成"

# ── Step 7: 建置前端 ──
step "建置前端..."
DIST_DIR="$SCRIPT_DIR/frontend/dist"
if [ -d "$DIST_DIR" ]; then
    log "前端已建置，跳過（如需重新建置請執行：rm -rf frontend/dist && bash setup.sh）"
else
    if command -v node &>/dev/null; then
        NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
        if [ "$NODE_VER" -ge 18 ] 2>/dev/null; then
            cd "$SCRIPT_DIR/frontend"
            npm install --silent
            npm run build --silent
            cd "$SCRIPT_DIR"
            log "前端建置完成"
        else
            warn "Node.js 版本過舊（需要 v18+），跳過前端建置"
            warn "請安裝 Node.js 20+：https://nodejs.org 或 dnf module install nodejs:20"
        fi
    else
        warn "未安裝 Node.js，跳過前端建置"
        warn "安裝方法：dnf module install nodejs:20/common -y"
        warn "安裝後再執行：bash setup.sh"
    fi
fi

# ── 完成 ──
echo ""
echo "============================================"
log "設定完成！"
echo ""
echo "  下一步：執行 bash start.sh"
echo "  然後開啟瀏覽器：http://$(hostname -I | awk '{print $1}' 2>/dev/null || echo 'localhost'):8000"
echo "============================================"
echo ""
