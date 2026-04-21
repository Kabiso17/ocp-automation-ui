# TODO

## 待解決問題

### 🔴 高優先

- [ ] **oc-mirror list 認證驗證**
  - `REGISTRY_AUTH_FILE=/root/pull-secret` 是否真的讓 oc-mirror list operators 通過認證，需在 bastion 實測確認
  - 若不行，考慮改用 `podman login registry.redhat.io --authfile=/root/pull-secret` 先登入再執行

- [ ] **oc-mirror list operators 解析確認**
  - `_parse_catalog_list()` 和 `_parse_channels()` 依賴欄位位置（字元偏移）解析
  - 需確認實際 oc-mirror 輸出格式是否符合預期
  - 若格式不符，考慮改用 `--output=json` flag（如果有支援）

### 🟡 中優先

- [ ] **快取跨版本搜尋**
  - 目前快取管理面板只顯示已快取的版本，考慮加「搜尋其他版本快取」功能

### 🟢 低優先 / 改善

- [x] **快取 TTL 機制**
  - 已實作 `expires_at` 欄位與自動過期邏輯
  - Catalog 7 天，Package 3 天

- [x] **快取預熱（背景批次查詢）**
  - 已新增 `POST /api/operators/cache/warmup` 端點
  - 支援 SSE 串流顯示進度，並限制並行數為 1

- [x] **oc-mirror mirror_runner.py：pull secret 支援**
  - 已支援 `REGISTRY_AUTH_FILE` 環境變數傳入 pull secret

- [x] **Dashboard 狀態整合**
  - 已在 Dashboard 加入「快取狀態」和「工具安裝狀態」摘要卡片

- [x] **CI 觸發條件**
  - 已加入 `main` 分支觸發條件

- [ ] **PR 合併到 main**
  - 分支：`claude/add-operator-download-VkxUl`
  - PR #2 已開，待 review 後合併

## 已完成

- [x] CatalogBrowser "+" 快速加入（用 default_channel，不鎖版本）
- [x] CatalogBrowser 拆成「加入」和「▾ 查看頻道」兩個按鈕
- [x] 啟動時背景自動預熱 catalog 快取（從 site.yml 讀取 ocp_version）
- [x] add_or_update_operator 支援空版本（不鎖版本，oc-mirror 自動取最新）
- [x] 新增 Operator 下載頁面（oc-mirror --v2 + SSE log）
- [x] 新增 CLI 工具下載頁面（oc / oc-mirror / openshift-install）
- [x] 修復 Windows asyncio 相容性（改用 subprocess + run_in_executor）
- [x] 新增 GitHub Actions CI（frontend build + backend import 驗證 + Docker build）
- [x] setup.sh 自動 clone 三個 repo + 建立 /root/start-ocp.sh 捷徑
- [x] start.sh 自動開放防火牆 port 8000
- [x] 新增「瀏覽所有可用 Operators」功能（CatalogBrowser）
- [x] 新增 SQLite 本地快取（operator_cache.py）
- [x] 快取命中 UI 提示 + 強制重新查詢按鈕
- [x] 快取管理面板（統計、按版本清除、全部清除）
- [x] 移除不支援的 --image-timeout / --v1 / --registry-config flag
- [x] 改用 REGISTRY_AUTH_FILE 環境變數傳入 pull secret

