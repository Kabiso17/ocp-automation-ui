# OpenShift 自動化安裝操作手冊

> **寫給誰看**：這份手冊是寫給第一次安裝 OpenShift 的人看的。  
> 你不需要懂 Ansible、Kubernetes 或微服務，只要照著做就可以。  
> 每個步驟都會說明你應該看到什麼結果，如果不對就停下來找人確認。

---

## 目錄

1. [你需要準備什麼](#第一章你需要準備什麼)
2. [下載程式並啟動管理介面](#第二章下載程式並啟動管理介面)
3. [填寫安裝設定](#第三章填寫安裝設定)
4. [下載 CLI 工具](#第四章下載-cli-工具)
5. [設定 ImageSet（映像清單）](#第五章設定-imageset映像清單)
6. [下載 Operator 映像（oc-mirror）](#第六章下載-operator-映像oc-mirror)
7. [Phase 1 — 環境準備](#第七章phase-1--環境準備)
8. [Phase 2 — Day1 安裝](#第八章phase-2--day1-安裝)
9. [手動步驟：安裝 CoreOS 節點](#第九章手動步驟安裝-coreos-節點)
10. [Phase 3 — 安裝後配置](#第十章phase-3--安裝後配置)
11. [手動步驟：Gitea 帳號建立](#第十一章手動步驟gitea-帳號建立)
12. [Phase 4 — GitOps & Operators](#第十二章phase-4--gitops--operators)
13. [確認安裝成功](#第十三章確認安裝成功)
14. [常見問題](#第十四章常見問題)

---

## 第一章：你需要準備什麼

### 1.1 機器需求

| 角色 | 作業系統 | 最低規格 | 數量 |
|------|---------|---------|------|
| **Bastion**（主要操作機器） | RHEL 9 | 8 CPU / 16GB RAM / 500GB 硬碟 | 1 |
| **Bootstrap**（安裝用，裝完可關） | — | 4 CPU / 16GB RAM / 80GB 硬碟 | 1 |
| **Master 節點** | — | 8 CPU / 32GB RAM / 120GB 硬碟 | 3 |
| **Worker 節點**（Standard mode） | — | 4 CPU / 16GB RAM / 100GB 硬碟 | 依需求 |

> **Compact mode**：只有 3 台 Master，省略 Worker，適合測試環境。  
> **Standard mode**：有獨立 Worker 節點，適合生產環境。

### 1.2 帳號需求

1. **Red Hat 帳號** — 申請：https://developers.redhat.com
2. **Pull Secret** — 下載：https://console.redhat.com/openshift/downloads → 點「Copy pull secret」存成 `/root/pull-secret`

### 1.3 網路需求

- Bastion 在 **第二～六章** 期間需要**對外網路**（下載工具和映像）
- 第七章（Phase 1）以後可離線
- 所有節點需在**同一網段**，可互相 ping

### 1.4 確認 RHEL 訂閱

```bash
subscription-manager status
# 應看到：Overall Status: Current
```

---

## 第二章：下載程式並啟動管理介面

> 所有指令在 **Bastion** 上以 `root` 執行。

### 2.1 切換 root

```bash
sudo -i
```

### 2.2 安裝基本工具

```bash
dnf install -y git python3 python3-pip
dnf module install -y nodejs:20/common
```

確認：

```bash
python3 --version  # 應看到 3.x
node --version     # 應看到 v20.x
```

### 2.3 說明：這個專案需要 3 個 Repo

| # | Repo | 角色 | 由誰處理 |
|---|------|------|---------|
| ① | `ocp-automation-ui` | Web 管理介面 | **你手動 clone** |
| ② | `ocp-automation` | Ansible Playbook 入口（site.yml） | `setup.sh` 自動 clone |
| ③ | `OpenShift-Automation` | Ansible Roles 核心邏輯 | `setup.sh` 自動 clone |

**你只需要執行第一個 clone，剩下的 `setup.sh` 會自動處理。**

clone 完成後的目錄結構：

```
/root/
├── ocp-automation-ui/          ← ① 你 clone 的（管理介面）
│   ├── automation/             ← ② setup.sh 自動 clone（Playbooks）
│   └── ...
└── OpenShift-Automation/       ← ③ setup.sh 自動 clone（Roles）
```

### 2.4 Clone 管理介面

```bash
cd /root
git clone https://github.com/Kabiso17/ocp-automation-ui.git
```

### 2.5 放入 Pull Secret

```bash
# 方法一：scp 從你的電腦上傳
scp pull-secret root@<Bastion-IP>:/root/pull-secret

# 方法二：直接貼上內容
vim /root/pull-secret
# 按 i，貼上 JSON 內容，按 Esc，輸入 :wq
```

確認：

```bash
cat /root/pull-secret | python3 -m json.tool | head -3
# 應看到 JSON 格式 {
```

### 2.6 執行初次設定

```bash
bash /root/ocp-automation-ui/setup.sh
```

`setup.sh` 會自動依序執行：

| 步驟 | 動作 |
|------|------|
| 確認 Python / Git | 確保工具存在 |
| Clone `ocp-automation` | 下載到 `./automation/` |
| Clone `OpenShift-Automation` | 下載到 `../OpenShift-Automation/` |
| 建立 vars / logs 目錄 | 準備執行時需要的目錄 |
| 建立 Python venv | 隔離 Python 套件環境 |
| 安裝 Python 套件 | fastapi、uvicorn 等 |
| Build 前端 | 編譯 React UI |

完成後應看到：

```
============================================
[✓] 設定完成！

  已準備的目錄：
    UI 程式：        /root/ocp-automation-ui
    Ansible 入口：   /root/ocp-automation-ui/automation
    Ansible Roles：  /root/OpenShift-Automation

  下一步：執行 bash start.sh
  然後開啟瀏覽器：http://172.20.11.50:8000
============================================
```

### 2.7 啟動管理介面

setup.sh 完成後會在 `/root/` 建立捷徑 `start-ocp.sh`，之後每次啟動用這個：

```bash
bash /root/start-ocp.sh
```

### 2.8 開啟瀏覽器

在你的電腦瀏覽器輸入：`http://<Bastion-IP>:8000`

看到深色管理介面代表成功。

> **打不開？** 確認防火牆：
> ```bash
> firewall-cmd --add-port=8000/tcp --permanent && firewall-cmd --reload
> ```

---

## 第三章：填寫安裝設定

點選左側「**配置**」，依序填寫五個 Tab，完成後點**儲存**。

### Tab 1：叢集資訊

| 欄位 | 說明 | 範例 |
|------|------|------|
| 安裝模式 | 3 台 Master 選 compact；有 Worker 選 standard | compact |
| 叢集名稱 | 英文小寫，自訂 | ocp4 |
| 基礎域名 | 公司內部域名 | demo.lab |
| OCP 版本 | 要安裝的版本 | 4.20.8 |
| Registry 密碼 | Mirror Registry 密碼，自訂 | P@ssw0rd |
| OCP 管理員帳號 | 安裝後的管理員帳號 | ocpadmin |

> 叢集名稱 `ocp4` + 基礎域名 `demo.lab` → 叢集域名 `ocp4.demo.lab`

### Tab 2：節點配置

填寫每台機器 IP。Compact mode 只需填 Bastion、Bootstrap、master01~03。

### Tab 3：版本工具

保留預設值即可。

### Tab 4：CSI 儲存

沒有 NetApp → 選 **NFS CSI**，保留預設。  
有 NetApp → 選 **Trident**，填寫 NetApp 連線資訊。

### Tab 5：GitOps

| 欄位 | 說明 |
|------|------|
| Gitea 管理員帳號 / 密碼 | 自訂，後續建立 Gitea 時使用 |
| GitOps 叢集類型 | 一般選 standard-with-virt |
| ArgoCD 安裝模式 | 單一叢集選 spoke |

**儲存後**到 Dashboard 確認「配置尚未填寫完整」警告消失。

---

## 第四章：下載 CLI 工具

> 點選左側「**CLI 工具下載**」

這個頁面讓你直接從 Red Hat mirror 下載並安裝 CLI 工具，不需要手動找下載連結。

### 4.1 設定

| 設定 | 說明 |
|------|------|
| OCP 版本 | 自動帶入「配置」頁的 `ocp_release` |
| 安裝目錄 | Linux 預設 `/usr/local/bin`，確認已在 PATH |

### 4.2 下載工具

頁面顯示三個工具，依序點**下載安裝**：

| 工具 | 用途 | 平台 |
|------|------|------|
| **oc** | OpenShift CLI，叢集操作 | Linux / Windows / macOS |
| **oc-mirror** | 映像同步工具 | Linux |
| **openshift-install** | OCP 安裝程式 | Linux / macOS |

> 在 Windows 上開發只有 `oc` 可下載；`oc-mirror` 和 `openshift-install` 需在 Bastion（Linux）安裝。

### 4.3 確認安裝

```bash
oc version --client
oc-mirror version
openshift-install version
```

---

## 第五章：設定 ImageSet（映像清單）

> 點選左側「**ImageSet**」

`imageset-config.yaml` 定義 oc-mirror 要下載的映像。在這裡管理要安裝的 Operators。

### 5.1 搜尋並加入 Operator

1. 輸入 Operator 名稱（例如 `kubevirt-hyperconverged`）
2. 點**查詢**（需要幾分鐘，會拉取 catalog index）
3. 選擇頻道，點**加入 ImageSet**

### 5.2 常用 Operator 名稱

| Operator | 名稱 |
|----------|------|
| OpenShift Virtualization | `kubevirt-hyperconverged` |
| OpenShift Data Foundation | `odf-operator` |
| Advanced Cluster Management | `advanced-cluster-management` |
| Compliance Operator | `compliance-operator` |

### 5.3 確認設定

點**查看 YAML** 預覽完整的 `imageset-config.yaml`。

---

## 第六章：下載 Operator 映像（oc-mirror）

> 點選左側「**Operator 下載**」

> ⚠️ **最耗時的步驟**，需要數小時，請確認網路穩定和磁碟空間充足（建議 500GB+）。

### 6.1 選擇目標

| 類型 | 說明 | 推薦 |
|------|------|------|
| **本地磁碟** | 存成 `.tar` 到本地，之後再推送 | ✅ 一般情況 |
| **Registry** | 直接推送到 Mirror Registry | Registry 已啟動時 |

本地磁碟路徑填：`/root/install/ocp`

### 6.2 開始下載

點**開始下載**，Log 視窗顯示即時進度。  
中途中斷沒關係，再點**開始下載**即可斷點續傳。

---

## 第七章：Phase 1 — 環境準備

> 「**執行**」→「Phase 1 — 環境準備」→ 點**執行**

Phase 1 會安裝 ansible-navigator、建立 EE Image、準備 Ansible 環境。  
約 **10～30 分鐘**，Log 最後看到 `failed=0` 代表成功。

---

## 第八章：Phase 2 — Day1 安裝

> 「Phase 2 — Day1 安裝」→ 點**執行**

Phase 2 設定 Bastion（DNS、haproxy）、推送映像到 Mirror Registry、產生安裝設定。  
約 **30～60 分鐘**，`failed=0` 代表成功。

---

## 第九章：手動步驟：安裝 CoreOS 節點

Phase 2 完成後，到每台機器上執行安裝。

### 安裝順序

1. Bootstrap
2. master01 / master02 / master03
3. Infra（如有）
4. Worker（如有）

### 每台機器執行

```bash
# Bootstrap
curl http://<Bastion-IP>:8080/install.sh | bash -s - /dev/sda bootstrap

# Master
curl http://<Bastion-IP>:8080/install.sh | bash -s - /dev/sda master
```

安裝完後關機，退出 ISO，重新開機。

### 監控

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
watch -n 5 'oc get nodes'
# 等所有節點都是 Ready（約 20～40 分鐘）
```

---

## 第十章：Phase 3 — 安裝後配置

> 「Phase 3 — 安裝後配置」→ 點**執行**

自動核准 CSR、等待 Operator 就緒、安裝 CSI、部署 Gitea。約 **30～60 分鐘**。

---

## 第十一章：手動步驟：Gitea 帳號建立

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get route -n gitea
```

開啟 Gitea 網址，點「Register」，用配置頁的 `gitea_admin` 帳密建立帳號。  
**第一個**註冊的帳號自動成為管理員。

---

## 第十二章：Phase 4 — GitOps & Operators

> 「Phase 4 — GitOps & Operators」→ 點**執行**

建立 GitOps repo、安裝 ArgoCD、透過 ArgoCD 安裝所有 Operators。約 **30～60 分鐘**。

---

## 第十三章：確認安裝成功

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get nodes          # 所有節點 Ready
oc get co             # 所有 AVAILABLE=True，DEGRADED=False
oc get route -n openshift-console   # 取得 Console 網址
```

用 `ocp_admin` 帳號登入 Console，看到叢集首頁代表安裝完成 🎉

---

## 第十四章：常見問題

### Q: setup.sh 提示無法 clone ocp-automation 或 OpenShift-Automation

Repo 可能是 Private，需要授權：

```bash
git config --global credential.helper store
git clone https://github.com/Kabiso17/ocp-automation.git /root/ocp-automation-ui/automation
git clone https://github.com/Kabiso17/OpenShift-Automation.git /root/OpenShift-Automation
```

---

### Q: 瀏覽器打不開 http://Bastion-IP:8000

```bash
firewall-cmd --add-port=8000/tcp --permanent && firewall-cmd --reload
ss -tlnp | grep 8000
```

---

### Q: CLI 工具下載失敗（HTTP 404）

版本號不正確。到 https://mirror.openshift.com/pub/openshift-v4/clients/ocp/ 確認可用版本。

---

### Q: oc-mirror 下載中斷

直接在「**Operator 下載**」頁面再點**開始下載**，支援斷點續傳。

---

### Q: Phase 執行失敗，`ansible-navigator: command not found`

Phase 1 尚未完成，先確認 Phase 1 成功再繼續。

---

### Q: Phase 3 等節點超時（超過 40 分鐘）

手動核准 CSR：

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get csr -o go-template='{{range .items}}{{if not .status}}{{.metadata.name}}{{"\n"}}{{end}}{{end}}' \
  | xargs oc adm certificate approve
```

---

## 附錄 A：指令速查

```bash
# 初次設定（只需執行一次）
bash /root/ocp-automation-ui/setup.sh

# 啟動管理介面（之後每次用這個）
bash /root/start-ocp.sh

# 確認叢集狀態
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get nodes && oc get co

# 手動核准 CSR
oc get csr -o go-template='{{range .items}}{{if not .status}}{{.metadata.name}}{{"\n"}}{{end}}{{end}}' \
  | xargs oc adm certificate approve

# 安裝 CoreOS 節點
curl http://<Bastion-IP>:8080/install.sh | bash -s - /dev/sda <bootstrap|master|worker>
```

---

## 附錄 B：相關連結

| 用途 | 網址 |
|------|------|
| Red Hat Pull Secret | https://console.redhat.com/openshift/downloads |
| OCP Mirror（工具下載）| https://mirror.openshift.com/pub/openshift-v4/clients/ocp/ |
| RHEL 下載 | https://access.redhat.com/downloads |
| OCP 版本升級路徑 | https://access.redhat.com/labs/ocpupgradegraph |
| Operator 版本查詢 | https://access.redhat.com/labs/ocpouic |
