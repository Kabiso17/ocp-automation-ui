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

- [ ] **CatalogBrowser 批次快速加入**
  - 目前只能逐一點「+」加入，考慮加「全選 / 多選後批次加入」功能

## 已完成

- [x] 快取 TTL 機制（expires_at，catalog 7 天、package 3 天，含舊 DB 自動 migration）
- [x] 快取預熱端點 `POST /api/operators/cache/warmup`（SSE 串流、並行限制 1）
- [x] Dashboard 加入快取狀態 + CLI 工具安裝狀態摘要卡片
- [x] CI 觸發條件加入 main 分支
- [x] 修復 warmup_generator 遺漏 `import json` 與 `get_package`
- [x] 修復 sqlite3.Row 不能 `.get()` → 改用 `row["column"]` bracket 存取
- [x] CLI 工具安裝目錄固定為 `/usr/local/bin`（移除 Windows C:\Tools 覆蓋邏輯）
- [x] CatalogBrowser「+」快速加入自動填入最新版本（minVersion = maxVersion = head_version）
- [x] CatalogBrowser 支援多列同時展開（expanded 改為 Set<string>）
- [x] CatalogBrowser "+" 快速加入（用 default_channel）
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
- [x] oc-mirror mirror_runner.py 支援 pull secret（REGISTRY_AUTH_FILE）
