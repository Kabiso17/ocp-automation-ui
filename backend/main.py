from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import SiteConfig, PhaseStatus, ValidationResult
from config import read_config, write_config, validate_config
from runner import run_phase, phase_states, log_generator, VALID_PHASES
import asyncio

app = FastAPI(
    title="OCP Automation API",
    description="OpenShift Automation UI - Backend API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────
# Health
# ──────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ocp-automation-api"}


# ──────────────────────────────────────────
# Config
# ──────────────────────────────────────────
@app.get("/api/config", response_model=SiteConfig)
def get_config():
    return read_config()


@app.post("/api/config")
def save_config(config: SiteConfig):
    write_config(config)
    return {"message": "配置已儲存"}


@app.get("/api/config/validate", response_model=ValidationResult)
def validate():
    config = read_config()
    errors = validate_config(config)
    return ValidationResult(valid=len(errors) == 0, errors=errors)


# ──────────────────────────────────────────
# Phases
# ──────────────────────────────────────────
@app.get("/api/phases/status")
def get_phase_statuses():
    return {
        phase: PhaseStatus(phase=phase, **state)
        for phase, state in phase_states.items()
    }


@app.post("/api/phases/{phase}", status_code=202)
async def trigger_phase(phase: str, background_tasks: BackgroundTasks):
    if phase not in VALID_PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase '{phase}'. Valid: {VALID_PHASES}")

    target_keys = ["prep", "install", "post", "operators"] if phase == "all" else [phase]
    for key in target_keys:
        if phase_states[key]["status"] == "running":
            raise HTTPException(status_code=409, detail=f"Phase '{key}' is already running")

    background_tasks.add_task(run_phase, phase)
    return {"message": f"Phase '{phase}' 已開始執行", "phase": phase}


@app.get("/api/phases/{phase}/logs")
async def stream_phase_logs(phase: str):
    if phase not in ["prep", "install", "post", "operators"]:
        raise HTTPException(status_code=400, detail="Invalid phase")
    return StreamingResponse(
        log_generator(phase),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.delete("/api/phases/{phase}/reset")
def reset_phase(phase: str):
    if phase not in ["prep", "install", "post", "operators"]:
        raise HTTPException(status_code=400, detail="Invalid phase")
    if phase_states[phase]["status"] == "running":
        raise HTTPException(status_code=409, detail="Cannot reset a running phase")
    phase_states[phase] = {
        "status": "pending",
        "started_at": None,
        "finished_at": None,
        "exit_code": None,
        "log_lines": 0,
    }
    return {"message": f"Phase '{phase}' 已重置"}
