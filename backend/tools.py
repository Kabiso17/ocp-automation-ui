"""
tools.py
--------
從 Red Hat mirror 下載並安裝 OCP 相關指令工具。
支援 oc、oc-mirror、openshift-install，跨平台（Linux/Windows/macOS）。
"""

import asyncio
import os
import platform
import subprocess
import tarfile
import threading
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

# Red Hat 公開 mirror 基礎 URL
MIRROR_BASE = "https://mirror.openshift.com/pub/openshift-v4/clients/ocp"

# 工具定義：每個工具在各平台的壓縮檔名稱
TOOL_DEFS: Dict[str, Dict] = {
    "oc": {
        "label": "OpenShift CLI (oc)",
        "description": "主要 OCP 命令列工具，用於與叢集互動",
        "archives": {
            "linux":   "openshift-client-linux.tar.gz",
            "windows": "openshift-client-windows.zip",
            "darwin":  "openshift-client-mac.tar.gz",
        },
        "binary":     "oc",
        "binary_win": "oc.exe",
        "version_cmd": ["oc", "version", "--client"],
    },
    "oc-mirror": {
        "label": "oc-mirror",
        "description": "OCP 映像同步工具，用於離線環境映像複製",
        "archives": {
            "linux":   "oc-mirror.tar.gz",
            "windows": None,
            "darwin":  None,
        },
        "binary":     "oc-mirror",
        "binary_win": None,
        "version_cmd": ["oc-mirror", "version"],
    },
    "openshift-install": {
        "label": "openshift-install",
        "description": "OCP 安裝程式，用於部署 OpenShift 叢集",
        "archives": {
            "linux":   "openshift-install-linux.tar.gz",
            "windows": None,
            "darwin":  "openshift-install-mac.tar.gz",
        },
        "binary":     "openshift-install",
        "binary_win": None,
        "version_cmd": ["openshift-install", "version"],
    },
}

LOG_DIR = Path(os.getenv("LOG_DIR", "/tmp/ocp-logs"))
TOOLS_LOG_FILE = LOG_DIR / "tools-download.log"

# 下載狀態（in-memory）
download_state: Dict[str, Any] = {
    "status":      "idle",   # idle | running | success | failed
    "tool":        None,
    "version":     None,
    "started_at":  None,
    "finished_at": None,
    "log_lines":   0,
}


def _platform() -> str:
    s = platform.system().lower()
    if s == "linux":
        return "linux"
    if s == "darwin":
        return "darwin"
    return "windows"


def _tmp_dir() -> Path:
    plat = _platform()
    if plat == "windows":
        return Path(os.environ.get("TEMP", "C:\\Temp"))
    return Path("/tmp")


def check_tool_version(tool_key: str) -> Optional[str]:
    """執行工具的 version 指令，回傳版本字串；若未安裝則回傳 None。"""
    cmd = TOOL_DEFS[tool_key]["version_cmd"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = (result.stdout or result.stderr).strip()
        if output:
            return output.splitlines()[0]
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def get_tools_status() -> Dict[str, Any]:
    """回傳每個工具的安裝狀態與版本。"""
    plat = _platform()
    status: Dict[str, Any] = {}
    for key, info in TOOL_DEFS.items():
        installed_version = check_tool_version(key)
        archive_name = info["archives"].get(plat)
        status[key] = {
            "label":       info["label"],
            "description": info["description"],
            "installed":   installed_version is not None,
            "version":     installed_version,
            "available":   archive_name is not None,
            "platform":    plat,
        }
    return status


def _download_and_install(
    tool_key: str,
    ocp_version: str,
    install_dir: str,
    log_path: Path,
) -> None:
    """同步下載並安裝工具（在執行緒中執行）。"""
    plat = _platform()
    info = TOOL_DEFS[tool_key]
    archive_name = info["archives"].get(plat)

    def log(msg: str) -> None:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
            f.flush()
        download_state["log_lines"] += 1

    if not archive_name:
        log(f"[ERROR] {tool_key} 在 {plat} 平台上目前不提供下載")
        download_state.update({
            "status": "failed",
            "finished_at": datetime.now().isoformat(),
        })
        return

    url = f"{MIRROR_BASE}/{ocp_version}/{archive_name}"
    archive_path = _tmp_dir() / archive_name

    try:
        log(f"[INFO] 工具：{info['label']}")
        log(f"[INFO] 版本：{ocp_version}")
        log(f"[INFO] 來源：{url}")
        log(f"[INFO] 平台：{plat}")
        log(f"[INFO] 安裝目錄：{install_dir}")
        log("")

        # ── 下載 ────────────────────────────────────
        downloaded_mb = [0]

        def reporthook(block_count: int, block_size: int, total_size: int) -> None:
            mb = block_count * block_size // 1024 // 1024
            if mb != downloaded_mb[0] and mb % 5 == 0:
                downloaded_mb[0] = mb
                if total_size > 0:
                    pct = min(block_count * block_size * 100 // total_size, 100)
                    total_mb = total_size // 1024 // 1024
                    log(f"  下載進度：{pct}%  ({mb} MB / {total_mb} MB)")

        log(f"[INFO] 開始下載...")
        urllib.request.urlretrieve(url, archive_path, reporthook)
        size_mb = archive_path.stat().st_size // 1024 // 1024
        log(f"[OK]   下載完成（{size_mb} MB）")
        log("")

        # ── 解壓縮 ──────────────────────────────────
        install_path = Path(install_dir)
        install_path.mkdir(parents=True, exist_ok=True)
        binary_name = info["binary_win"] if plat == "windows" else info["binary"]

        log(f"[INFO] 解壓縮 {archive_name}...")

        if archive_name.endswith(".tar.gz"):
            with tarfile.open(archive_path, "r:gz") as tar:
                found = False
                for member in tar.getmembers():
                    # 只抓目標 binary（忽略路徑前綴）
                    basename = Path(member.name).name
                    if basename == binary_name:
                        member.name = binary_name
                        tar.extract(member, path=str(install_path))
                        found = True
                        break
                if not found:
                    log(f"[WARN] 壓縮檔中找不到 {binary_name}，解壓縮所有檔案")
                    tar.extractall(path=str(install_path))

        elif archive_name.endswith(".zip"):
            with zipfile.ZipFile(archive_path, "r") as zf:
                found = False
                for name in zf.namelist():
                    if Path(name).name == binary_name:
                        data = zf.read(name)
                        (install_path / binary_name).write_bytes(data)
                        found = True
                        break
                if not found:
                    log(f"[WARN] 壓縮檔中找不到 {binary_name}，解壓縮所有檔案")
                    zf.extractall(path=str(install_path))

        # ── 設定執行權限（Unix）──────────────────────
        if plat != "windows":
            bin_file = install_path / binary_name
            if bin_file.exists():
                bin_file.chmod(0o755)
                log(f"[OK]   設定執行權限：{bin_file}")

        # ── 清理暫存 ─────────────────────────────────
        archive_path.unlink(missing_ok=True)

        log("")
        log(f"[SUCCESS] {tool_key} 已安裝至：{install_path / binary_name}")

        # ── 驗證 ─────────────────────────────────────
        version = check_tool_version(tool_key)
        if version:
            log(f"[OK]   版本驗證：{version}")
        else:
            log(f"[WARN] 無法驗證版本（請確認 {install_dir} 已加入 PATH）")

        download_state.update({
            "status": "success",
            "finished_at": datetime.now().isoformat(),
        })

    except urllib.error.HTTPError as e:
        log(f"\n[ERROR] 下載失敗（HTTP {e.code}）：{url}")
        log(f"[HINT]  請確認版本號是否正確，或到以下網址確認：")
        log(f"        {MIRROR_BASE}/")
        download_state.update({
            "status": "failed",
            "finished_at": datetime.now().isoformat(),
        })

    except Exception as exc:
        log(f"\n[ERROR] 安裝失敗：{exc}")
        download_state.update({
            "status": "failed",
            "finished_at": datetime.now().isoformat(),
        })

    finally:
        # 確保暫存檔清理
        if archive_path.exists():
            archive_path.unlink(missing_ok=True)


async def start_tool_download(
    tool_key: str,
    ocp_version: str,
    install_dir: str,
) -> None:
    """非同步啟動工具下載（透過執行緒，相容 Windows）。"""
    if tool_key not in TOOL_DEFS:
        raise ValueError(f"未知工具：{tool_key}")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    TOOLS_LOG_FILE.write_text("")

    download_state.update({
        "status":      "running",
        "tool":        tool_key,
        "version":     ocp_version,
        "started_at":  datetime.now().isoformat(),
        "finished_at": None,
        "log_lines":   0,
    })

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        _download_and_install,
        tool_key,
        ocp_version,
        install_dir,
        TOOLS_LOG_FILE,
    )


async def tools_log_generator():
    """SSE generator：串流工具下載 log。"""
    if not TOOLS_LOG_FILE.exists():
        TOOLS_LOG_FILE.write_text("")

    with open(TOOLS_LOG_FILE, "r", encoding="utf-8") as f:
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                if download_state.get("status") != "running":
                    yield "data: [STREAM_END]\n\n"
                    break
                await asyncio.sleep(0.3)
