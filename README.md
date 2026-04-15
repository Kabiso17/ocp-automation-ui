# OCP Automation UI

OpenShift 自動化安裝管理介面，提供 Web UI 操作 [ocp-automation](https://github.com/Kabiso17/ocp-automation) 的所有功能。

## 功能

- **Dashboard** — 即時查看 4 個 Phase 的狀態與進度
- **配置** — 透過 Web 表單填寫 `vars/site.yml`（叢集資訊、節點 IP、CSI、GitOps）
- **執行** — 一鍵觸發各 Phase 或全流程，即時串流 Log 輸出

## 技術架構

| 層 | 技術 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 後端 | FastAPI (Python 3.11) + uvicorn |
| 部署 | Docker Compose |

## 快速啟動

### 使用 Docker Compose（推薦）

```bash
git clone https://github.com/Kabiso17/ocp-automation-ui.git
cd ocp-automation-ui
docker compose up -d
```

開啟瀏覽器：**http://localhost:3000**

### 本地開發

**前置需求：** Python 3.11+、Node.js 20+

**1. 建立 vars 目錄**
```bash
mkdir -p vars
```

**2. Backend:**
```bash
cd backend

# 建立並啟動 Python 虛擬環境
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

# 設定 SITE_VARS_PATH 指向專案根目錄的 vars/site.yml
SITE_VARS_PATH=../vars/site.yml uvicorn main:app --reload --port 8000
```

> Windows PowerShell 的話要分開設定環境變數：
> ```powershell
> $env:SITE_VARS_PATH = "..\vars\site.yml"
> uvicorn main:app --reload --port 8000
> ```

**3. Frontend（另開一個終端機）:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

> Frontend 的 `vite.config.ts` 已設定 proxy，`/api` 請求會自動轉到 `localhost:8000`，不需要額外設定。

## API 文件

後端啟動後開啟：http://localhost:8000/docs

## 目錄結構

```
ocp-automation-ui/
├── backend/
│   ├── main.py         # FastAPI app + API routes
│   ├── models.py       # Pydantic models (SiteConfig, PhaseStatus...)
│   ├── config.py       # vars/site.yml 讀寫
│   ├── runner.py       # ansible-navigator 執行 + log streaming
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/      # Dashboard, Configuration, Phases
│   │   ├── components/ # Layout, Sidebar, PhaseCard, LogViewer, NodeTable
│   │   ├── api/        # axios API client
│   │   └── types/      # TypeScript 型別定義
│   ├── Dockerfile
│   └── nginx.conf
├── vars/               # 掛載 site.yml（由 UI 寫入，automation 讀取）
└── docker-compose.yml
```

## 搭配使用

此 UI 需搭配 [ocp-automation](https://github.com/Kabiso17/ocp-automation) repo 使用。
`vars/site.yml` 由 UI 產生，automation repo 的 site.yml 透過 `-e @vars/site.yml` 讀入。
