from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from models import (
    SiteConfig, PhaseStatus, ValidationResult,
    OperatorSearchRequest, OperatorSearchResult,
    AddOperatorRequest, RemoveOperatorRequest,
    MirrorRunRequest, MirrorStatus,
)
from config import read_config, write_config, validate_config
from runner import run_phase, phase_states, log_generator, VALID_PHASES
from imageset import (
    read_imageset, write_imageset,
    search_operator, add_or_update_operator, remove_operator,
    list_catalog_operators,
)
from mirror_runner import run_oc_mirror, mirror_state, mirror_log_generator
from tools import (
    get_tools_status, start_tool_download,
    tools_log_generator, download_state, TOOL_DEFS,
)

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


# ──────────────────────────────────────────
# ImageSet 管理
# ──────────────────────────────────────────

@app.get("/api/imageset")
def get_imageset():
    """讀取 imageset-config.yaml"""
    return read_imageset()


@app.put("/api/imageset")
def put_imageset(data: dict):
    """直接覆寫整個 imageset-config.yaml（進階用法）"""
    write_imageset(data)
    return {"message": "imageset-config.yaml 已儲存"}


@app.get("/api/operators/catalog")
async def get_catalog_operators(ocp_version: str = "4.20"):
    """
    列出指定 catalog 中所有可用的 Operators。
    不加 --package，回傳完整清單（name / display_name / default_channel）。
    注意：首次執行需拉取 catalog index image，可能需要 5～30 分鐘。
    """
    return await list_catalog_operators(ocp_version)


@app.post("/api/imageset/operators/search", response_model=OperatorSearchResult)
async def search_operator_versions(req: OperatorSearchRequest):
    """
    呼叫 oc-mirror list operators 查詢指定 operator 的頻道與版本。
    使用 --image-timeout 避免拉取 catalog index 時 timeout。
    """
    result = await search_operator(
        operator_name=req.operator_name,
        ocp_version=req.ocp_version,
        image_timeout=req.image_timeout,
    )
    return result


@app.post("/api/imageset/operators/add")
def add_operator_to_imageset(req: AddOperatorRequest):
    """在 imageset 中新增或更新一個 operator。"""
    imageset = read_imageset()
    updated = add_or_update_operator(
        imageset,
        operator_name=req.operator_name,
        channel=req.channel,
        version=req.version,
        catalog_tag=req.catalog_tag,
    )
    write_imageset(updated)
    return {"message": f"Operator '{req.operator_name}' 已加入 imageset"}


@app.delete("/api/imageset/operators/{operator_name}")
def delete_operator_from_imageset(operator_name: str, catalog_tag: str = "v4.20"):
    """從 imageset 移除指定 operator。"""
    imageset = read_imageset()
    updated = remove_operator(imageset, operator_name, catalog_tag)
    write_imageset(updated)
    return {"message": f"Operator '{operator_name}' 已從 imageset 移除"}


@app.get("/api/imageset/export")
def export_imageset_yaml():
    """以原始 YAML 文字回傳 imageset-config.yaml（方便複製）"""
    import yaml as _yaml
    data = read_imageset()
    raw = _yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return {"yaml": raw}


# ──────────────────────────────────────────
# oc-mirror 下載
# ──────────────────────────────────────────

@app.post("/api/mirror/run", status_code=202)
async def start_mirror_download(req: MirrorRunRequest, background_tasks: BackgroundTasks):
    """啟動 oc-mirror 下載流程。"""
    if mirror_state["status"] == "running":
        raise HTTPException(status_code=409, detail="oc-mirror 正在執行中，請等待完成後再試")
    background_tasks.add_task(run_oc_mirror, req.destination, req.workspace)
    return {"message": "oc-mirror 下載已開始", "destination": req.destination}


@app.get("/api/mirror/status", response_model=MirrorStatus)
def get_mirror_status():
    """取得 oc-mirror 執行狀態。"""
    return mirror_state


@app.get("/api/mirror/logs")
async def stream_mirror_logs():
    """SSE：串流 oc-mirror log。"""
    return StreamingResponse(
        mirror_log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/api/mirror/reset")
def reset_mirror_status():
    """重置 oc-mirror 狀態（不可在執行中呼叫）。"""
    if mirror_state["status"] == "running":
        raise HTTPException(status_code=409, detail="oc-mirror 正在執行中，無法重置")
    mirror_state.update(
        {
            "status": "idle",
            "started_at": None,
            "finished_at": None,
            "exit_code": None,
            "log_lines": 0,
            "command": None,
        }
    )
    return {"message": "oc-mirror 狀態已重置"}


# ──────────────────────────────────────────
# 工具下載
# ──────────────────────────────────────────

@app.get("/api/tools/status")
def get_tools_status_endpoint():
    """回傳每個 CLI 工具的安裝狀態與版本。"""
    return get_tools_status()


@app.post("/api/tools/download", status_code=202)
async def download_tool(
    tool: str,
    ocp_version: str,
    install_dir: str,
    background_tasks: BackgroundTasks,
):
    """下載並安裝指定工具。"""
    if tool not in TOOL_DEFS:
        raise HTTPException(status_code=400, detail=f"未知工具：{tool}，可用：{list(TOOL_DEFS.keys())}")
    if download_state["status"] == "running":
        raise HTTPException(status_code=409, detail="已有工具正在下載中，請等待完成")
    background_tasks.add_task(start_tool_download, tool, ocp_version, install_dir)
    return {"message": f"開始下載 {tool}@{ocp_version}", "tool": tool, "version": ocp_version}


@app.get("/api/tools/download/logs")
async def stream_tools_logs():
    """SSE：串流工具下載 log。"""
    return StreamingResponse(
        tools_log_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/tools/download/state")
def get_tools_download_state():
    """取得目前工具下載狀態。"""
    return download_state


@app.delete("/api/tools/download/reset")
def reset_tools_download():
    """重置工具下載狀態。"""
    if download_state["status"] == "running":
        raise HTTPException(status_code=409, detail="正在下載中，無法重置")
    download_state.update({
        "status": "idle", "tool": None, "version": None,
        "started_at": None, "finished_at": None, "log_lines": 0,
    })
    return {"message": "下載狀態已重置"}


# ──────────────────────────────────────────
# Serve Frontend (SPA)
# 必須放在所有 /api 路由之後
# ──────────────────────────────────────────
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

if _frontend_dist.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """SPA fallback: 所有非 /api 路徑都回傳 index.html"""
        return FileResponse(str(_frontend_dist / "index.html"))
