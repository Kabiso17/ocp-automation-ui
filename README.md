# OCP Automation UI

OpenShift 自動化安裝管理介面。  
透過 Web UI 填寫設定、下載工具、管理映像清單、一鍵執行各安裝 Phase、即時查看 Log。

📖 **[完整操作手冊](docs/manual.md)** ← 新手從這裡開始

---

## Repo 架構（需要 3 個 repo）

```
/root/
├── ocp-automation-ui/          ← ① 這個 repo（Web UI + API）
│   ├── setup.sh                   自動 clone ② 和 ③
│   ├── automation/             ← ② ocp-automation（自動 clone）
│   └── ...
└── OpenShift-Automation/       ← ③ OpenShift-Automation（自動 clone）
    └── roles/
        └── ocp_bastion_installer/
```

| # | Repo | 說明 | 由誰 clone |
|---|------|------|-----------|
| ① | [ocp-automation-ui](https://github.com/Kabiso17/ocp-automation-ui) | Web 管理介面 + REST API | 你手動 clone |
| ② | [ocp-automation](https://github.com/Kabiso17/ocp-automation) | Ansible Playbook 入口（site.yml） | `setup.sh` 自動 clone 到 `automation/` |
| ③ | [OpenShift-Automation](https://github.com/Kabiso17/OpenShift-Automation) | Ansible Roles 核心邏輯 | `setup.sh` 自動 clone 到 `../OpenShift-Automation/` |

> **你只需要手動 clone 這個 repo（①），其餘由 `setup.sh` 自動處理。**

---

## 快速啟動（3 個指令）

在 RHEL Bastion 上以 `root` 執行：

```bash
# 1. Clone 管理介面
cd /root
git clone https://github.com/Kabiso17/ocp-automation-ui.git

# 2. 初次設定（自動 clone 所需 repo、建環境、build 前端、建立 /root/start-ocp.sh 捷徑）
bash /root/ocp-automation-ui/setup.sh

# 3. 啟動（之後每次用這個）
bash /root/start-ocp.sh
```

然後在瀏覽器開啟：`http://<Bastion的IP>:8000`

> **前置需求**：RHEL 9、Python 3.9+、Node.js 20+、git
> ```bash
> dnf install -y git python3
> dnf module install -y nodejs:20/common
> ```

---

## 功能頁面

| 頁面 | 功能 |
|------|------|
| **Dashboard** | Phase 狀態總覽、配置完整性驗證 |
| **配置** | Web 表單填寫 `vars/site.yml`（叢集資訊、節點 IP、CSI、GitOps） |
| **執行** | 一鍵觸發各 Phase、即時 Log 串流 |
| **ImageSet** | 管理 imageset-config.yaml（搜尋、新增、移除 Operator）|
| **Operator 下載** | 執行 oc-mirror 將映像同步到 Registry 或本地磁碟 |
| **CLI 工具下載** | 從 Red Hat mirror 一鍵下載 oc / oc-mirror / openshift-install |

---

## 安裝流程概覽

```
① git clone ocp-automation-ui  +  bash setup.sh
   └─ 自動 clone ocp-automation     →  automation/
   └─ 自動 clone OpenShift-Automation → ../OpenShift-Automation/
         ↓
② 開啟 UI → 填寫配置（叢集資訊、節點 IP）
         ↓
③ CLI 工具下載  →  下載 oc / oc-mirror / openshift-install
         ↓
④ ImageSet 管理  →  搜尋並加入需要的 Operators
         ↓
⑤ Operator 下載  →  執行 oc-mirror 下載映像（需要對外網路，數小時）
         ↓
⑥ 執行 Phase 1  →  環境準備（ansible-navigator）
         ↓
⑦ 執行 Phase 2  →  Day1 安裝（Bastion 設定 + 節點安裝）
         ↓
⑧ 手動：在每台節點上執行 coreos-installer
         ↓
⑨ 執行 Phase 3  →  安裝後配置（CSR 核准、CSI、Gitea）
         ↓
⑩ 手動：Gitea 建立帳號
         ↓
⑪ 執行 Phase 4  →  GitOps & Operators（ArgoCD bootstrap）
         ↓
     ✅ OpenShift 安裝完成
```

---

## 目錄結構

```
ocp-automation-ui/
├── setup.sh                ← 初次設定腳本（clone repos、建環境、build 前端）
├── start.sh                ← 啟動腳本（port 8000）
├── backend/                ← FastAPI（同時 serve 前端靜態檔）
│   ├── main.py             ← API 路由
│   ├── config.py           ← 配置讀寫
│   ├── runner.py           ← Phase 執行
│   ├── imageset.py         ← ImageSet 管理
│   ├── mirror_runner.py    ← oc-mirror 下載
│   └── tools.py            ← CLI 工具下載
├── frontend/               ← React UI（build 後由 backend serve）
├── automation/             ← setup.sh 自動 clone 的 ocp-automation repo
├── vars/site.yml           ← 統一配置檔（由 UI 寫入）
├── logs/                   ← Phase 執行 Log
└── docs/manual.md          ← 完整操作手冊
```

**Port 設計**：只用一個 port（8000）。Backend 同時提供 REST API（`/api/*`）和 React UI。

---

## 本地開發（Windows / Mac）

**前置需求：** Python 3.11+、Node.js 20+

### 1. Clone 所需的 repos

```bash
git clone https://github.com/Kabiso17/ocp-automation-ui.git
cd ocp-automation-ui
mkdir -p vars logs
git clone https://github.com/Kabiso17/ocp-automation.git automation
```

### 2. 啟動 Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

SITE_VARS_PATH=../vars/site.yml \
AUTOMATION_DIR=../automation \
LOG_DIR=../logs \
  uvicorn main:app --reload --port 8000
```

> Windows PowerShell：
> ```powershell
> $env:SITE_VARS_PATH = "..\vars\site.yml"
> $env:AUTOMATION_DIR = "..\automation"
> $env:LOG_DIR        = "..\logs"
> uvicorn main:app --reload --port 8000
> ```

### 3. 啟動 Frontend（另開終端機）

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000（自動 proxy /api 到 port 8000）
```

### 4. Build 前端

```bash
cd frontend && npm run build
```

---

## Docker Compose（選用）

```bash
# 先 build 前端
cd frontend && npm install && npm run build && cd ..

# 啟動
docker compose up -d
# 開啟 http://localhost:8000
```

---

## API 文件

後端啟動後開啟：`http://localhost:8000/docs`
