# OpenShift 自動化安裝操作手冊

> **寫給誰看**：這份手冊是寫給第一次安裝 OpenShift 的人看的。  
> 你不需要懂 Ansible、Kubernetes 或微服務，只要照著做就可以。  
> 每個步驟都會說明你應該看到什麼結果，如果不對就停下來找人確認。

---

## 目錄

1. [你需要準備什麼](#第一章你需要準備什麼)
2. [安裝工具並啟動管理介面](#第二章安裝工具並啟動管理介面)
3. [填寫安裝設定](#第三章填寫安裝設定)
4. [Phase 1 — 環境準備（需要對外網路）](#第四章phase-1--環境準備)
5. [手動步驟：執行映像下載](#第五章手動步驟執行映像下載)
6. [Phase 2 — Day1 安裝](#第六章phase-2--day1-安裝)
7. [手動步驟：安裝 CoreOS 節點](#第七章手動步驟安裝-coreos-節點)
8. [Phase 3 — 安裝後配置](#第八章phase-3--安裝後配置)
9. [手動步驟：Gitea 帳號建立](#第九章手動步驟gitea-帳號建立)
10. [Phase 4 — GitOps & Operators](#第十章phase-4--gitops--operators)
11. [確認安裝成功](#第十一章確認安裝成功)
12. [常見問題](#第十二章常見問題)

---

## 第一章：你需要準備什麼

### 1.1 機器需求

你需要準備以下機器（IP 位址請向你的網管確認）：

| 角色 | 作業系統 | 最低規格 | 數量 |
|------|---------|---------|------|
| **Bastion**（你主要操作的機器） | RHEL 9 | 8 CPU / 16GB RAM / 200GB 硬碟 | 1 |
| **Bootstrap**（安裝用，裝好可關掉） | — | 4 CPU / 16GB RAM / 80GB 硬碟 | 1 |
| **Master 節點** | — | 8 CPU / 32GB RAM / 120GB 硬碟 | 3 |
| **Worker 節點**（Standard mode 才需要） | — | 4 CPU / 16GB RAM / 100GB 硬碟 | 依需求 |

> **什麼是 Compact mode？**  
> 如果你只有 3 台機器（Master x3），就選 Compact mode，Master 同時兼任 Worker。  
> 如果需要更多節點（生產環境），選 Standard mode，再加 Worker 節點。

### 1.2 帳號需求

在開始之前你需要有：

1. **Red Hat 帳號** — 用來下載 OpenShift 映像
   - 申請網址：https://developers.redhat.com
   - 免費版可以用，但有資源限制，正式環境需要訂閱

2. **Pull Secret** — 這是你的 Red Hat 下載金鑰
   - 下載網址：https://console.redhat.com/openshift/downloads
   - 點選「Copy pull secret」，存成一個叫 `pull-secret` 的檔案（注意：沒有副檔名）

3. **GitHub 帳號**（選用）— 如果你想備份設定

### 1.3 網路需求

- Bastion 機器在 **Phase 1** 期間需要**對外網路**（下載 OpenShift 映像）
- Phase 2 以後，Bastion 可以是**離線環境**
- 所有節點需要在**同一個網段**，可以互相 ping 到

### 1.4 確認 Bastion 有 RHEL 訂閱

在 Bastion 上執行以下指令，確認有訂閱：

```bash
subscription-manager status
```

你應該看到 `Overall Status: Current`，如果不是請找管理員協助。

---

## 第二章：安裝工具並啟動管理介面

> 所有指令都在 **Bastion** 機器上執行，使用 `root` 帳號。

### 2.1 切換到 root

```bash
sudo -i
```

看到 `[root@bastion ~]#` 就代表你是 root 了。

### 2.2 安裝基本工具

```bash
dnf install -y git python3 python3-pip
```

看到 `Complete!` 代表安裝完成。

### 2.3 安裝 Node.js（用來建置管理介面）

```bash
dnf module install -y nodejs:20/common
```

確認安裝成功：

```bash
node --version
```

應該看到 `v20.x.x`。

### 2.4 下載管理介面程式

```bash
cd /root
git clone https://github.com/Kabiso17/ocp-automation-ui.git
cd ocp-automation-ui
```

> **如果看到錯誤** `Permission denied` 或 `Repository not found`：  
> 代表你沒有 repo 的存取權限，請聯絡管理員。

### 2.5 把 pull-secret 放到正確位置

你在 1.2 節下載的 `pull-secret` 檔案，需要放到 Bastion 的 `/root/pull-secret`：

```bash
# 方法一：用 scp 從你的電腦上傳（在你自己的電腦上執行）
scp pull-secret root@<Bastion的IP>:/root/pull-secret

# 方法二：直接用 vim 貼上內容
vim /root/pull-secret
# 按 i 進入編輯模式，貼上 pull secret 內容，按 Esc，輸入 :wq 儲存
```

確認檔案存在：

```bash
ls -la /root/pull-secret
cat /root/pull-secret | python3 -m json.tool | head -5
```

你應該看到一些 JSON 內容，開頭是 `{`。

### 2.6 執行初次設定

```bash
cd /root/ocp-automation-ui
bash setup.sh
```

這個指令會自動：
- 下載 OpenShift 安裝程式（Ansible playbooks）
- 建立 Python 執行環境
- 安裝所需套件
- 建置管理介面

整個過程大概需要 **3～5 分鐘**，你應該看到一系列 `[✓]` 的訊息，最後看到：

```
============================================
[✓] 設定完成！

  下一步：執行 bash start.sh
  然後開啟瀏覽器：http://172.20.11.50:8000
============================================
```

> **如果看到 `[✗]` 錯誤**：請把錯誤訊息記下來，對照第十二章常見問題。

### 2.7 啟動管理介面

```bash
bash start.sh
```

你應該看到：

```
============================================
  OCP Automation UI
============================================

[✓] 服務位址：http://172.20.11.50:8000
[✓] API 文件：http://172.20.11.50:8000/docs

[!] 按 Ctrl+C 停止服務
```

### 2.8 開啟瀏覽器

在你的**電腦**（不是 Bastion）開啟瀏覽器，輸入：

```
http://<Bastion的IP>:8000
```

例如：`http://172.20.11.50:8000`

你應該看到一個深色背景的管理介面，左側有三個選項：Dashboard、配置、執行。

> **如果打不開**：確認 Bastion 防火牆有開放 8000 port：
> ```bash
> firewall-cmd --add-port=8000/tcp --permanent
> firewall-cmd --reload
> ```

---

## 第三章：填寫安裝設定

> 點選左側選單的「**配置**」進入設定頁面。  
> 設定分成五個 Tab，請依序填寫。  
> 填寫完成後記得點**儲存**按鈕。

### Tab 1：叢集資訊

| 欄位 | 說明 | 範例 |
|------|------|------|
| 安裝模式 | 只有 3 台 Master 選 compact；有額外 Worker/Infra 選 standard | compact |
| 叢集名稱 | 自己取的叢集短名，英文小寫 | ocp4 |
| 基礎域名 | 你們公司的內部域名 | demo.lab |
| OCP 版本 | 要安裝的 OpenShift 版本 | 4.20.8 |
| RHEL 版本 | Bastion 的 RHEL 版本，通常是 rhel9 | rhel9 |
| Registry 密碼 | Mirror Registry 的密碼，可以自己設 | P@ssw0rd |
| OCP 管理員帳號 | 安裝完成後的管理員帳號名稱 | ocpadmin |

> **叢集名稱 + 基礎域名**組合成叢集的完整域名。  
> 例如：叢集名稱 `ocp4` + 基礎域名 `demo.lab` → `ocp4.demo.lab`

### Tab 2：節點配置

填寫每台機器的 IP 位址：

| 欄位 | 說明 |
|------|------|
| Bastion IP | 這台機器的 IP |
| Bootstrap IP | 暫時用的安裝機，裝完 OpenShift 後可以關掉 |
| master01/02/03 IP | 三台 Master 節點的 IP |
| infra01/02/03 IP | Infra 節點（只有 standard mode 需要填） |
| worker01/02/03 IP | Worker 節點（只有 standard mode 需要填） |

> **範例**（Compact mode，只需填前兩區）：
> ```
> Bastion IP:    172.20.11.50
> Bootstrap IP:  172.20.11.60
> master01 IP:   172.20.11.51
> master02 IP:   172.20.11.52
> master03 IP:   172.20.11.53
> ```

### Tab 3：版本工具

這個 Tab 通常不需要修改，保留預設值即可。  
除非你有特殊版本需求，否則跳過。

### Tab 4：CSI 儲存

| 欄位 | 說明 |
|------|------|
| CSI 類型 | 沒有 NetApp 就選 NFS CSI；有 NetApp 就選 Trident |

**選擇 NFS CSI（一般情況）**：只需要保留預設值，不用填其他欄位。

**選擇 Trident（有 NetApp）**：需要填寫 NetApp 的連線資訊，請洽你的 NetApp 管理員。

### Tab 5：GitOps

| 欄位 | 說明 | 預設值 |
|------|------|-------|
| Gitea 管理員帳號 | GitOps 用的 Git 伺服器管理員帳號 | gitadmin |
| Gitea 管理員密碼 | 自己設定，記住它 | P@ssw0rd |
| GitOps 叢集類型 | 一般選 standard-with-virt（含虛擬化） | standard-with-virt |
| ArgoCD 安裝模式 | 單一叢集選 spoke | spoke |

### 儲存設定

填完所有 Tab 之後，點右上角的**儲存**按鈕。  
看到「已儲存」的綠色訊息代表成功。

> **確認設定正確**：點選左側「Dashboard」，如果看到黃色的「配置尚未填寫完整」警告，  
> 點進去看看缺哪個欄位，補填後再儲存。

---

## 第四章：Phase 1 — 環境準備

> **這個 Phase 需要對外網路**，會從 Red Hat 下載大量資料（約 10～50GB）。  
> 請確認 Bastion 網路正常且空間充足。

點選左側「**執行**」，找到「Phase 1 — 環境準備」，點**執行**按鈕。

### Phase 1 在做什麼

1. 建立必要的目錄結構
2. 下載 OpenShift 安裝工具（oc client、oc-mirror 等）
3. 下載 Helm、Mirror Registry 等工具
4. 準備 Ansible 執行環境
5. 根據你的設定（NFS CSI 或 Trident）自動加入對應的 container images 清單

### 執行時間

大約 **10～30 分鐘**，取決於網路速度。

### 看 Log

點「查看 Log」按鈕可以看到即時輸出。  
正常的 Log 最後會顯示：

```
TASK [prep] Phase 1 完成 ****
ok: [localhost] => {
    "msg": "Phase 1 完成。請調整 /root/install/ocp/imageset-config.yaml 配置後執行 oc-mirror..."
}
PLAY RECAP
localhost : ok=XX changed=XX unreachable=0 failed=0
```

看到 `failed=0` 代表成功。如果 `failed` 不是 0，請記下錯誤訊息對照第十二章。

---

## 第五章：手動步驟：執行映像下載

> Phase 1 完成後，你需要手動執行這個步驟。  
> 這個步驟會把 OpenShift 所有需要的 container images 下載到 Bastion 本機。  
> **這是整個安裝過程中最耗時的步驟**，可能需要幾個小時。

### 5.1 確認 imageset-config.yaml

```bash
cat /root/install/ocp/imageset-config.yaml
```

確認 `ocp_release` 版本號和你在設定頁填的一致。如果有需要調整，用 vim 修改：

```bash
vim /root/install/ocp/imageset-config.yaml
```

### 5.2 執行 oc-mirror（下載映像）

```bash
cd /root/install/ocp
oc-mirror -c imageset-config.yaml file:///root/install/ocp --cache-dir /root/install/ocp/cache --v2
```

這個指令會開始下載，你會看到進度條。完成後目錄裡應該有：

```
/root/install/ocp/
├── imageset-config.yaml
├── mirror_000001.tar      ← 下載的映像檔（可能有多個）
├── mirror_000002.tar
└── cache/
```

### 5.3 產生 MD5 檢查碼

```bash
sh /root/ocp-automation-ui/automation/scripts/checkmd5_verify.sh create
```

完成後確認：

```bash
ls /root/install/ocp/*.md5
```

應該每個 `.tar` 都有對應的 `.md5` 檔案。

### 5.4 完成後繼續

映像下載完成後，回到管理介面繼續 Phase 2。

---

## 第六章：Phase 2 — Day1 安裝

> **這個 Phase 開始，Bastion 不需要對外網路。**  
> Phase 2 會把 OpenShift 實際安裝到你的節點上。

點選「Phase 2 — Day1 安裝」，點**執行**按鈕。

### Phase 2 在做什麼

1. 安裝 ansible-navigator
2. 設定 Bastion 為 OpenShift 安裝節點（DNS、haproxy、Mirror Registry 等）
3. 設定 NTP 時間同步
4. 啟動 Mirror Registry 並把映像推上去
5. 產生 OpenShift 安裝設定檔（install-config.yaml）
6. 提供 CoreOS 安裝服務

### 執行時間

大約 **30～60 分鐘**。

### 成功的 Log 特徵

```
PLAY RECAP
localhost : ok=XX changed=XX unreachable=0 failed=0
```

---

## 第七章：手動步驟：安裝 CoreOS 節點

> Phase 2 完成後，Bastion 已經啟動了一個 HTTP 安裝服務。  
> 你需要手動到每台機器（Bootstrap、Master）開機並安裝 CoreOS。

### 7.1 安裝順序

必須依照這個順序安裝：
1. Bootstrap（先）
2. Master 01/02/03
3. Infra 節點（如有）
4. Worker 節點（如有）

### 7.2 在每台機器上執行

拿一台機器，用 LiveCD 或網路開機進入臨時環境後，執行：

```bash
# 把 <Bastion的IP> 換成你的 Bastion IP
# 把 <device> 換成磁碟裝置名稱（通常是 /dev/sda）
# 把 <role> 換成這台機器的角色（bootstrap / master / worker）

curl http://<Bastion的IP>:8080/install.sh | bash -s - <device> <role>
```

**範例（安裝第一台 Bootstrap，磁碟是 /dev/sda）**：

```bash
curl http://172.20.11.50:8080/install.sh | bash -s - /dev/sda bootstrap
```

**範例（安裝 master01）**：

```bash
curl http://172.20.11.50:8080/install.sh | bash -s - /dev/sda master
```

### 7.3 安裝完成後

每台機器安裝完 CoreOS 後：
1. 關機（`poweroff`）
2. **如果是虛擬機**，先退出 ISO/LiveCD 再開機
3. 讓機器自動開機，等待它連到 Bastion

### 7.4 監控安裝進度

回到 Bastion，執行：

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
watch -n 5 'oc get nodes'
```

等到所有節點都出現並且狀態變成 `Ready` 再進行下一步。  
這可能需要 **20～40 分鐘**。

---

## 第八章：Phase 3 — 安裝後配置

點選「Phase 3 — 安裝後配置」，點**執行**按鈕。

### Phase 3 在做什麼

1. 自動核准節點的 CSR 憑證請求
2. 等待所有 Cluster Operator 就緒
3. 設定 Mirror Registry 來源（讓叢集從本機 Registry 拉 image）
4. 建立管理員帳號（你在設定裡填的 `ocp_admin`）
5. 安裝 CSI 存儲（NFS 或 Trident）
6. 如果是 Standard mode，設定 Infra 節點
7. 部署 Gitea（內部 Git 伺服器）

### 執行時間

大約 **30～60 分鐘**，其中等待節點就緒最耗時。

### 這個 Phase 可以放著等

Phase 3 會自動等待節點就緒，不需要一直盯著。  
你可以點「查看 Log」確認進度，看到 `approve_csr 執行完成` 代表節點都好了。

---

## 第九章：手動步驟：Gitea 帳號建立

> Phase 3 部署 Gitea 後，你需要手動建立管理員帳號。

### 9.1 取得 Gitea 網址

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get route -n gitea
```

你會看到類似：

```
NAME    HOST/PORT                                    ...
gitea   gitea-gitea.apps.ocp4.demo.lab               ...
```

### 9.2 開啟 Gitea 網站

在你的電腦瀏覽器開啟：`https://gitea-gitea.apps.ocp4.demo.lab`

（把 `ocp4.demo.lab` 換成你自己的叢集域名）

### 9.3 註冊管理員帳號

1. 點右上角「Register」
2. 填入帳號（和設定頁的 `gitea_admin` 一樣）
3. 填入密碼（和設定頁的 `gitea_password` 一樣）
4. 填入 Email
5. 點「Register Account」

> **第一個註冊的帳號會自動成為管理員**，不需要特別設定。

---

## 第十章：Phase 4 — GitOps & Operators

點選「Phase 4 — GitOps & Operators」，點**執行**按鈕。

### Phase 4 在做什麼

1. 在 Gitea 建立 OpenShift-EaaS-Practice repo
2. 把 GitOps 設定推送到 Gitea
3. 安裝並設定 ArgoCD
4. 透過 ArgoCD 安裝所有 Operators（依你選擇的 gitops_cluster_type）

### 執行時間

大約 **30～60 分鐘**。

### 確認 ArgoCD 安裝完成

Phase 4 完成後，開啟 ArgoCD 管理介面：

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get route -n openshift-gitops
```

用瀏覽器開啟 ArgoCD 網址，確認所有 Application 都是綠色的（Synced）。

---

## 第十一章：確認安裝成功

### 11.1 確認叢集狀態

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig

# 確認節點都是 Ready
oc get nodes

# 確認所有 Cluster Operator 都正常
oc get co

# 確認 Pod 都在跑
oc get pods -A | grep -v Running | grep -v Completed
```

**預期結果**：
- `oc get nodes` → 所有節點都是 `Ready`
- `oc get co` → 所有 Operator 的 `AVAILABLE` 都是 `True`，`DEGRADED` 都是 `False`
- `oc get pods -A` → 沒有 `Error` 或 `CrashLoopBackOff` 的 Pod

### 11.2 登入 OpenShift Web Console

```bash
oc get route -n openshift-console
```

用瀏覽器開啟 Console 網址，用你設定的管理員帳號（`ocp_admin`）和密碼 `P@ssw0rdocp` 登入。

### 11.3 恭喜！

如果以上都正常，OpenShift 安裝完成了 🎉

---

## 第十二章：常見問題

### Q: setup.sh 執行時出現 `無法 clone ocp-automation`

**原因**：ocp-automation 是 private repo，你的機器沒有存取權限。

**解決**：
```bash
# 在 Bastion 上設定 GitHub token
git config --global credential.helper store
git clone https://github.com/Kabiso17/ocp-automation.git /root/ocp-automation-ui/automation
# 輸入 GitHub 帳號和 Personal Access Token
```

---

### Q: 瀏覽器打不開 http://Bastion-IP:8000

**確認防火牆**：
```bash
firewall-cmd --list-ports
# 如果沒有 8000/tcp，執行：
firewall-cmd --add-port=8000/tcp --permanent
firewall-cmd --reload
```

**確認服務在跑**：
```bash
# 看 start.sh 那個視窗是否還開著
# 或確認 port 被佔用
ss -tlnp | grep 8000
```

---

### Q: Phase 執行失敗，Log 顯示 `ansible-navigator: command not found`

**原因**：Phase 1 還沒成功完成。

**解決**：先確認 Phase 1 成功完成，ansible-navigator 會在 Phase 1 安裝。

---

### Q: Phase 1 下載失敗或很慢

**確認網路**：
```bash
curl -I https://mirror.openshift.com
```

**如果是代理環境**，需要設定：
```bash
export http_proxy=http://proxy-server:port
export https_proxy=http://proxy-server:port
export no_proxy=localhost,127.0.0.1,172.20.11.0/24
```

---

### Q: oc-mirror 下載到一半失敗

oc-mirror 支援斷點續傳，重新執行同一個指令即可：

```bash
cd /root/install/ocp
oc-mirror -c imageset-config.yaml file:///root/install/ocp --cache-dir /root/install/ocp/cache --v2
```

---

### Q: Phase 3 等節點超時（超過 40 分鐘）

手動核准 CSR：

```bash
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get csr
oc get csr -o go-template='{{range .items}}{{if not .status}}{{.metadata.name}}{{"\n"}}{{end}}{{end}}' | xargs oc adm certificate approve
```

---

### Q: 管理介面的 Log 顯示亂碼

這是 ANSI 顏色碼，Log Viewer 會自動濾掉，不影響實際結果。  
如果看起來很亂，點「下載」把 Log 存下來用文字編輯器開啟。

---

### Q: 安裝完後怎麼重新啟動管理介面

```bash
cd /root/ocp-automation-ui
bash start.sh
```

---

## 附錄 A：完整指令速查

```bash
# 初次設定（只需要執行一次）
cd /root/ocp-automation-ui && bash setup.sh

# 啟動管理介面
cd /root/ocp-automation-ui && bash start.sh

# 手動執行映像下載（Phase 1 後）
cd /root/install/ocp
oc-mirror -c imageset-config.yaml file:///root/install/ocp --cache-dir /root/install/ocp/cache --v2

# 安裝 CoreOS 節點
curl http://<Bastion-IP>:8080/install.sh | bash -s - /dev/sda <role>

# 確認叢集狀態
export KUBECONFIG=/root/ocp4/auth/kubeconfig
oc get nodes && oc get co
```

## 附錄 B：相關連結

| 用途 | 網址 |
|------|------|
| OpenShift 下載中心 | https://mirror.openshift.com/pub/openshift-v4 |
| Red Hat Pull Secret | https://console.redhat.com/openshift/downloads |
| RHEL 下載 | https://access.redhat.com/downloads |
| OCP 版本升級路徑查詢 | https://access.redhat.com/labs/ocpupgradegraph |
| Operator 版本查詢 | https://access.redhat.com/labs/ocpouic |
