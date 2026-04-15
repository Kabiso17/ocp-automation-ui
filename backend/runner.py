import asyncio
import subprocess
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

LOG_DIR = Path(os.getenv("LOG_DIR", "/tmp/ocp-logs"))
AUTOMATION_DIR = Path(os.getenv("AUTOMATION_DIR", "/app/automation"))

PHASE_COMMANDS = {
    "prep":      "ansible-navigator run site.yml -e @vars/site.yml --tags prep -m stdout",
    "install":   "ansible-navigator run site.yml -e @vars/site.yml --tags install -m stdout",
    "post":      "ansible-navigator run site.yml -e @vars/site.yml --tags post -m stdout",
    "operators": "ansible-navigator run site.yml -e @vars/site.yml --tags operators -m stdout",
    "all":       "ansible-navigator run site.yml -e @vars/site.yml -m stdout",
}

VALID_PHASES = list(PHASE_COMMANDS.keys())

# In-memory state
phase_states: Dict[str, dict] = {
    p: {"status": "pending", "started_at": None, "finished_at": None, "exit_code": None, "log_lines": 0}
    for p in ["prep", "install", "post", "operators"]
}

# Running processes
_processes: Dict[str, Optional[asyncio.subprocess.Process]] = {}


def get_log_path(phase: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR / f"{phase}.log"


async def run_phase(phase: str) -> None:
    if phase not in PHASE_COMMANDS:
        raise ValueError(f"Unknown phase: {phase}")

    # Reset log
    log_path = get_log_path(phase if phase != "all" else "all")
    log_path.write_text("")

    state_keys = ["prep", "install", "post", "operators"] if phase == "all" else [phase]
    for key in state_keys:
        phase_states[key]["status"] = "running"
        phase_states[key]["started_at"] = datetime.now().isoformat()
        phase_states[key]["finished_at"] = None
        phase_states[key]["exit_code"] = None
        phase_states[key]["log_lines"] = 0

    cmd = PHASE_COMMANDS[phase]
    cwd = str(AUTOMATION_DIR) if AUTOMATION_DIR.exists() else "/tmp"

    try:
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd,
        )
        _processes[phase] = process

        with open(log_path, "a") as log_file:
            line_count = 0
            async for line in process.stdout:
                decoded = line.decode("utf-8", errors="replace")
                log_file.write(decoded)
                log_file.flush()
                line_count += 1
                for key in state_keys:
                    phase_states[key]["log_lines"] = line_count

        await process.wait()
        exit_code = process.returncode

        finished_at = datetime.now().isoformat()
        status = "success" if exit_code == 0 else "failed"
        for key in state_keys:
            phase_states[key]["status"] = status
            phase_states[key]["finished_at"] = finished_at
            phase_states[key]["exit_code"] = exit_code

    except Exception as e:
        finished_at = datetime.now().isoformat()
        for key in state_keys:
            phase_states[key]["status"] = "failed"
            phase_states[key]["finished_at"] = finished_at
            phase_states[key]["exit_code"] = -1
        with open(log_path, "a") as log_file:
            log_file.write(f"\n[ERROR] {str(e)}\n")
    finally:
        _processes.pop(phase, None)


async def log_generator(phase: str):
    """SSE generator: stream log file lines"""
    log_path = get_log_path(phase)
    if not log_path.exists():
        log_path.write_text("")

    with open(log_path, "r") as f:
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                # Check if phase is still running
                state = phase_states.get(phase, {})
                if state.get("status") not in ("running",):
                    yield "data: [STREAM_END]\n\n"
                    break
                await asyncio.sleep(0.2)
