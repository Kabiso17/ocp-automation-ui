# OCP Automation UI — Claude Code 專案說明

## 專案架構

```
ocp-automation-ui/
├── backend/                  ← FastAPI (Python)
│   ├── main.py               API 路由總入口
│   ├── config.py             site.yml 讀寫
│   ├── runner.py             Phase 執行（ansible-navigator）
│   ├── imageset.py           imageset-config.yaml 管理 + oc-mirror list
│   ├── operator_cache.py     SQLite 快取（operator 查詢結果）
│   ├── mirror_runner.py      oc-mirror --v2 下載（SSE log 串流）
│   ├── tools.py              CLI 工具下載（oc / oc-mirror / openshift-install）
│   └── models.py             Pydantic 資料模型
├── frontend/                 ← React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/            各功能頁面
│       ├── api/client.ts     Axios API 封裝
│       ├── types/index.ts    TypeScript 型別定義
│       └── components/       Sidebar 等共用元件
├── vars/site.yml             使用者配置（由 UI 寫入）
├── logs/                     Phase 執行 log + operator-cache.db
├── automation/               ocp-automation repo（setup.sh 自動 clone）
├── setup.sh                  初次設定（clone repos、建 venv、build 前端）
└── start.sh                  啟動服務（port 8000，自動開防火牆）
```

## 開發指令

```bash
# 啟動 backend（開發模式）
cd backend
source venv/bin/activate
SITE_VARS_PATH=../vars/site.yml AUTOMATION_DIR=../automation LOG_DIR=../logs \
  uvicorn main:app --reload --port 8000

# 啟動 frontend（開發模式）
cd frontend
npm run dev   # http://localhost:3000，自動 proxy /api → port 8000

# Build 前端
cd frontend && npm run build

# 驗證 TypeScript
cd frontend && npx tsc --noEmit
```

## 目前開發分支

`claude/add-operator-download-VkxUl` → PR 已開，目標合併到 `main`

CI 只在 `release` 分支觸發（`.github/workflows/ci.yml`）。

## 重要設計決策

### 單一 Port 架構
只用 port 8000。Backend 提供 `/api/*`，同時 serve 前端 `frontend/dist/` 靜態檔。

### 非同步執行相容性
所有長時間執行的指令（oc-mirror、ansible-navigator）都用：
```python
loop.run_in_executor(None, sync_func, ...)
```
不使用 `asyncio.create_subprocess_exec`（Windows 不支援）。

### oc-mirror 版本現況
- **list operators**：`oc-mirror list operators --catalog=...`（無 --v1/--v2 flag）
- **認證**：透過 `REGISTRY_AUTH_FILE` 環境變數傳入 pull secret 路徑
- **mirror（下載）**：`oc-mirror --v2 --config=... --workspace=... <destination>`

### Operator 快取
- 檔案：`$LOG_DIR/operator-cache.db`（SQLite）
- `catalog_cache` 表：整個 catalog 清單（key: ocp_version）
- `package_cache` 表：單一 operator 頻道/版本（key: ocp_version + package_name）
- 查詢優先走快取，`force_refresh=true` 強制重新查詢
- 目前快取**永不過期**（待加 TTL）

### Pull Secret
使用者在 ImageSet 頁面頂部填入路徑（預設 `/root/pull-secret`），
backend 透過 `REGISTRY_AUTH_FILE` 環境變數傳給 oc-mirror。

## API 端點速查

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/config` | 讀取 site.yml |
| POST | `/api/config` | 寫入 site.yml |
| POST | `/api/phases/{phase}` | 觸發 Phase 執行 |
| GET | `/api/phases/{phase}/logs` | SSE log 串流 |
| GET | `/api/imageset` | 讀取 imageset-config.yaml |
| POST | `/api/imageset/operators/search` | 查詢 operator 頻道（有快取）|
| POST | `/api/imageset/operators/add` | 加入 operator |
| DELETE | `/api/imageset/operators/{name}` | 移除 operator |
| GET | `/api/operators/catalog` | 列出 catalog 所有 operators（有快取）|
| GET | `/api/operators/cache` | 快取統計 |
| DELETE | `/api/operators/cache` | 清除快取 |
| POST | `/api/mirror/run` | 啟動 oc-mirror 下載 |
| GET | `/api/mirror/logs` | SSE oc-mirror log |
| GET | `/api/tools/status` | CLI 工具安裝狀態 |
| POST | `/api/tools/download` | 下載 CLI 工具 |
