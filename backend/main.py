import asyncio
import json
import logging
from fastapi import FastAPI, HTTPException, BackgroundTasks
from typing import Optional
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
from operator_cache import get_stats, clear_cache, get_catalog, get_package
from tools import (
    get_tools_status, start_tool_download,
    tools_log_generator, download_state, TOOL_DEFS,
)

logger = logging.getLogger("ocp-ui")

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
# Startup：背景預熱 catalog 快取
# ──────────────────────────────────────────

@app.on_event("startup")
async def startup_prewarm():
    """
    啟動後自動在背景跑一次 oc-mirror list operators（catalog 整體清單）。
    - 已有快取 → 跳過，不重複查詢
    - 無快取 → 背景執行，成功後寫入 SQLite
    - 任何錯誤（oc-mirror 未安裝、網路問題）都靜默忽略
    OCP 版本從 site.yml 讀取，pull secret 預設 /root/pull-secret。
    """
    async def _prewarm():
        try:
            # 讀取 OCP 版本
            config = read_config()
            parts = config.ocp_release.split(".")
            ocp_version = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else "4.20"
        except Exception:
            ocp_version = "4.20"

        pull_secret = "/root/pull-secret"

        # 已有快取則跳過
        if get_catalog(ocp_version):
            logger.info(f"[prewarm] catalog v{ocp_version} 已有快取，跳過")
            return

        logger.info(f"[prewarm] 開始背景預熱 catalog v{ocp_version}…")
        try:
            result = await list_catalog_operators(ocp_version, pull_secret, force_refresh=False)
            if result.get("success"):
                logger.info(f"[prewarm] 完成，共 {result.get('total', 0)} 個 operators")
            else:
                logger.warning(f"[prewarm] 失敗：{result.get('error', '未知錯誤')}")
        except Exception as exc:
            logger.warning(f"[prewarm] 例外：{exc}")

    asyncio.create_task(_prewarm())


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
async def get_catalog_operators(
    ocp_version: str = "4.20",
    pull_secret: str = "/root/pull-secret",
    force_refresh: bool = False,
):
    """列出指定 catalog 所有可用 Operators。優先回傳快取；force_refresh=true 強制重新查詢。"""
    return await list_catalog_operators(ocp_version, pull_secret, force_refresh)


@app.get("/api/operators/cache")
def get_operator_cache():
    """取得本地快取統計（catalog 快取數、package 快取數、各筆快取時間）。"""
    return get_stats()


@app.delete("/api/operators/cache")
def delete_operator_cache(ocp_version: Optional[str] = None):
    """清除快取。ocp_version 指定時只清該版本，否則清除全部。"""
    count = clear_cache(ocp_version)
    msg = f"已清除 {count} 筆快取" + (f"（v{ocp_version}）" if ocp_version else "（全部）")
    return {"message": msg, "deleted": count}


async def warmup_generator(ocp_version: str, pull_secret: str):
    """SSE Generator: 預熱指定版本的所有 Operator 快取。"""
    # 1. 取得 catalog 清單
    result = await list_catalog_operators(ocp_version, pull_secret)
    if not result.get("success"):
        yield f"data: {json.dumps({'type': 'error', 'message': result.get('error')}, ensure_ascii=False)}\n\n"
        return

    operators = result.get("operators", [])
    total = len(operators)
    yield f"data: {json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

    # 使用 Semaphore 限制並行數（oc-mirror 很吃資源，建議設為 1）
    sem = asyncio.Semaphore(1)

    async def _fetch(op_name, index):
        async with sem:
            # 檢查是否已有快取（不重複查詢）
            if get_package(ocp_version, op_name):
                return {"type": "skip", "name": op_name, "index": index}
            
            res = await search_operator(op_name, ocp_version, pull_secret=pull_secret)
            if res.get("success"):
                return {"type": "done", "name": op_name, "index": index}
            else:
                return {"type": "fail", "name": op_name, "index": index, "error": res.get("error")}

    for i, op in enumerate(operators):
        op_name = op["name"]
        msg = await _fetch(op_name, i + 1)
        yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
        # 稍微喘息一下
        await asyncio.sleep(0.1)

    yield f"data: {json.dumps({'type': 'complete'}, ensure_ascii=False)}\n\n"


@app.post("/api/operators/cache/warmup")
async def start_cache_warmup(ocp_version: str = "4.20", pull_secret: str = "/root/pull-secret"):
    """
    觸發快取預熱。回傳 SSE 串流。
    注意：這會耗費大量時間與頻寬，建議在背景執行。
    """
    return StreamingResponse(
        warmup_generator(ocp_version, pull_secret),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/imageset/operators/search", response_model=OperatorSearchResult)
async def search_operator_versions(req: OperatorSearchRequest):
    """
    呼叫 oc-mirror list operators 查詢指定 operator 的頻道與版本。
    使用 --image-timeout 避免拉取 catalog index 時 timeout。
    """
    result = await search_operator(
        operator_name=req.operator_name,
        ocp_version=req.ocp_version,
        pull_secret=req.pull_secret,
        force_refresh=req.force_refresh,
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
    background_tasks.add_task(run_oc_mirror, req.destination, req.workspace, req.pull_secret)
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
