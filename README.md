# OCP Automation UI

OpenShift 自動化安裝管理介面。  
透過 Web UI 填寫設定、一鍵執行各安裝 Phase、即時查看 Log。

📖 **[完整操作手冊](docs/manual.md)** ← 新手從這裡開始

---

## 快速啟動（3 個指令）

在 RHEL Bastion 上執行：

```bash
# 1. 下載
git clone https://github.com/Kabiso17/ocp-automation-ui.git
cd ocp-automation-ui

# 2. 初次設定（只需要執行一次，約 3～5 分鐘）
bash setup.sh

# 3. 啟動
bash start.sh
```

然後在瀏覽器開啟：`http://<Bastion的IP>:8000`

> **前置需求**：RHEL 9、Python 3.9+、Node.js 20+、git
>
> ```bash
> dnf install -y git python3
> dnf module install -y nodejs:20/common
> ```

---

## 功能

| 頁面 | 功能 |
|------|------|
| **Dashboard** | 4 個 Phase 狀態總覽、配置完整性驗證 |
| **配置** | Web 表單填寫 `vars/site.yml`（叢集資訊、節點 IP、CSI、GitOps） |
| **執行** | 一鍵觸發各 Phase、即時 Log 串流、Log 下載 |

---

## 架構說明

```
ocp-automation-ui/          ← 這個 repo（管理介面）
├── setup.sh                ← 初次設定腳本
├── start.sh                ← 啟動腳本（port 8000）
├── backend/                ← FastAPI（同時 serve 前端靜態檔）
├── frontend/               ← React UI（build 後由 backend serve）
├── automation/             ← setup.sh 自動 clone 的 Ansible playbooks
├── vars/site.yml           ← 統一配置檔（由 UI 寫入）
├── logs/                   ← Phase 執行 Log
└── docs/manual.md          ← 完整操作手冊
```

**Port 設計**：只用一個 port（8000）。  
Backend 同時提供 REST API（`/api/*`）和 React UI（所有其他路徑）。  
不需要開兩個 port，不需要設定 nginx。

---

## 安裝流程概覽

```
[你的電腦] → 瀏覽器開啟 http://Bastion:8000
                 ↓
[Bastion] start.sh → uvicorn (port 8000)
                 ↓
         填寫配置 → 儲存到 vars/site.yml
                 ↓
         執行 Phase 1 → ansible-navigator → playbooks/01_prep.yml
         （需要對外網路，下載 OCP 工具）
                 ↓
         手動：執行 oc-mirror 下載映像（幾個小時）
                 ↓
         執行 Phase 2 → ansible-navigator → playbooks/02_install.yml
         （設定 Bastion、Mirror Registry、產生安裝設定）
                 ↓
         手動：在每台節點上執行 coreos-installer
                 ↓
         執行 Phase 3 → ansible-navigator → playbooks/03_post_install.yml
         （等節點 Ready、設定認證、安裝 CSI、部署 Gitea）
                 ↓
         手動：Gitea 帳號建立
                 ↓
         執行 Phase 4 → ansible-navigator → playbooks/04_operators.yml
         （GitOps bootstrap、安裝 Operators）
                 ↓
         ✅ OpenShift 安裝完成
```

---

## Docker Compose（選用）

如果你的環境有 Docker：

```bash
# 先建置前端
cd frontend && npm install && npm run build && cd ..

# 啟動
docker compose up -d

# 開啟 http://localhost:8000
```

> **注意**：Docker 方式需要 Bastion 上已安裝 `ansible-navigator`，  
> 容器會嘗試掛載 host 的 ansible-navigator binary。  
> 建議優先使用 `bash start.sh`（不需要 Docker）。

---

## 相關 Repo

| Repo | 說明 |
|------|------|
| [ocp-automation-ui](https://github.com/Kabiso17/ocp-automation-ui) | 這個 repo（Web UI + API） |
| [ocp-automation](https://github.com/Kabiso17/ocp-automation) | Ansible Playbooks（setup.sh 自動下載） |

---

## 本地開發

**前置需求：** Python 3.11+、Node.js 20+

**1. 建立 vars 目錄**
```bash
mkdir -p vars logs
git clone https://github.com/Kabiso17/ocp-automation.git automation
```

**2. Backend:**
```bash
cd backend

# 建立並啟動 Python 虛擬環境
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

# 設定 SITE_VARS_PATH 指向專案根目錄的 vars/site.yml
SITE_VARS_PATH=../vars/site.yml AUTOMATION_DIR=../automation LOG_DIR=../logs \
  uvicorn main:app --reload --port 8000
```

> Windows PowerShell：
> ```powershell
> $env:SITE_VARS_PATH = "..\vars\site.yml"
> $env:AUTOMATION_DIR = "..\automation"
> $env:LOG_DIR = "..\logs"
> uvicorn main:app --reload --port 8000
> ```

**3. Frontend（另開一個終端機）:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000（開發模式，自動 proxy 到 port 8000）
```

> Frontend 的 `vite.config.ts` 已設定 proxy，`/api` 請求會自動轉到 `localhost:8000`，不需要額外設定。

## API 文件

後端啟動後開啟：http://localhost:8000/docs
