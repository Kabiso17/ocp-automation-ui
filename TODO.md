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

- [ ] **快取 TTL 機制**
  - 目前快取永不過期，operator 版本資訊可能過時
  - 建議在 `catalog_cache` 和 `package_cache` 加入 `expires_at` 欄位
  - 預設 TTL：catalog 清單 7 天，package 頻道資訊 3 天

- [ ] **快取預熱（背景批次查詢）**
  - catalog 載入完成後，可選擇背景批次查詢所有 package 的 channel 資訊
  - 這樣展開每一列就能瞬間回傳，不需再等 oc-mirror
  - 實作：新增 `POST /api/operators/cache/warmup` 端點，SSE 串流預熱進度

- [ ] **PR 合併到 main**
  - 分支：`claude/add-operator-download-VkxUl`
  - PR #2 已開，待 review 後合併

### 🟢 低優先 / 改善

- [ ] **oc-mirror mirror_runner.py：pull secret 支援**
  - 目前 `run_oc_mirror()` 沒有傳入 pull secret
  - 實際執行 oc-mirror --v2 mirror 時也需要認證
  - 建議從 UI 的 pull secret 路徑欄位取值並傳入

- [ ] **Dashboard 狀態整合**
  - Dashboard 頁面顯示 Phase 狀態，可考慮也加入「快取狀態」和「工具安裝狀態」摘要

- [ ] **快取跨版本搜尋**
  - 目前快取管理面板只顯示已快取的版本，考慮加「搜尋其他版本快取」功能

- [ ] **CI 觸發條件**
  - 目前 CI 只在 `release` 分支觸發（`.github/workflows/ci.yml`）
  - 考慮是否也要在 PR 時觸發

## 已完成

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
