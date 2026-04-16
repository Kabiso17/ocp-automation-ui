"""
mirror_runner.py
----------------
執行 oc-mirror 將 imageset-config.yaml 中設定的映像同步到目標。
支援 docker:// (推送到 registry) 或 file:// (儲存到本地磁碟)。
"""

import asyncio
import subprocess
import threading
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from imageset import IMAGESET_PATH

LOG_DIR = Path(os.getenv("LOG_DIR", "/tmp/ocp-logs"))
MIRROR_LOG_FILE = LOG_DIR / "oc-mirror.log"

mirror_state: Dict[str, Any] = {
    "status": "idle",   # idle | running | success | failed
    "started_at": None,
    "finished_at": None,
    "exit_code": None,
    "log_lines": 0,
    "command": None,
}

_mirror_thread: Optional[threading.Thread] = None


def get_mirror_log_path() -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return MIRROR_LOG_FILE


def _run_oc_mirror_sync(cmd: list, cmd_str: str, log_path: Path) -> None:
    """在獨立執行緒中同步執行 oc-mirror，並把輸出逐行寫入 log 檔。"""
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"[INFO] 執行指令：{cmd_str}\n")
            log_file.write(f"[INFO] 開始時間：{mirror_state['started_at']}\n\n")
            log_file.flush()
            line_count = 2

            for raw_line in proc.stdout:
                decoded = raw_line.decode("utf-8", errors="replace")
                log_file.write(decoded)
                log_file.flush()
                line_count += 1
                mirror_state["log_lines"] = line_count

        proc.wait()
        exit_code = proc.returncode
        mirror_state.update(
            {
                "status": "success" if exit_code == 0 else "failed",
                "finished_at": datetime.now().isoformat(),
                "exit_code": exit_code,
            }
        )

    except FileNotFoundError:
        mirror_state.update(
            {"status": "failed", "finished_at": datetime.now().isoformat(), "exit_code": -1}
        )
        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write("[ERROR] 找不到 oc-mirror，請確認已安裝並在 PATH 中。\n")

    except Exception as exc:
        mirror_state.update(
            {"status": "failed", "finished_at": datetime.now().isoformat(), "exit_code": -1}
        )
        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"\n[ERROR] {exc}\n")


async def run_oc_mirror(destination: str, workspace: str = "/tmp/oc-mirror-workspace") -> None:
    """
    背景執行 oc-mirror v2（透過執行緒，相容 Windows asyncio）。

    destination: docker://registry:5000 或 file:///output/path
    workspace:   oc-mirror v2 工作目錄（--workspace）
    """
    global _mirror_thread

    log_path = get_mirror_log_path()
    log_path.write_text("")

    cmd = [
        "oc-mirror",
        "--v2",
        f"--config={IMAGESET_PATH}",
        f"--workspace={workspace}",
        destination,
    ]
    cmd_str = " ".join(cmd)

    mirror_state.update(
        {
            "status": "running",
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "exit_code": None,
            "log_lines": 0,
            "command": cmd_str,
        }
    )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_oc_mirror_sync, cmd, cmd_str, log_path)


async def mirror_log_generator():
    """SSE generator：串流 oc-mirror log 檔案內容。"""
    log_path = get_mirror_log_path()
    if not log_path.exists():
        log_path.write_text("")

    with open(log_path, "r") as f:
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                if mirror_state.get("status") != "running":
                    yield "data: [STREAM_END]\n\n"
                    break
                await asyncio.sleep(0.2)
