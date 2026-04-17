"""
imageset.py
-----------
讀寫 imageset-config.yaml，並透過 oc-mirror list operators 查詢可用版本。
"""

import os
import asyncio
import subprocess
import re
from pathlib import Path
from typing import List, Optional
import yaml

from operator_cache import get_package, set_package, get_catalog, set_catalog

# 預設路徑：automation repo 裡的 yaml/imageset-config.yaml
IMAGESET_PATH = Path(
    os.environ.get(
        "IMAGESET_PATH",
        str(Path(__file__).parent.parent / "automation" / "yaml" / "imageset-config.yaml"),
    )
)

_DEFAULT_IMAGESET = {
    "apiVersion": "mirror.openshift.io/v2alpha1",
    "kind": "ImageSetConfiguration",
    "archiveSize": 5,
    "mirror": {
        "platform": {
            "channels": [
                {
                    "name": "stable-4.20",
                    "minVersion": "4.20.0",
                    "maxVersion": "4.20.0",
                }
            ],
            "graph": True,
        },
        "operators": [
            {
                "catalog": "registry.redhat.io/redhat/redhat-operator-index:v4.20",
                "packages": [],
            }
        ],
        "additionalImages": [],
    },
}


def read_imageset() -> dict:
    """讀取 imageset-config.yaml，若不存在則回傳預設結構。"""
    if not IMAGESET_PATH.exists():
        return _DEFAULT_IMAGESET
    with open(IMAGESET_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if data else _DEFAULT_IMAGESET


def write_imageset(data: dict) -> None:
    """將 imageset-config.yaml 寫回磁碟。"""
    IMAGESET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(IMAGESET_PATH, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


async def search_operator(
    operator_name: str,
    ocp_version: str = "4.20",
    image_timeout: str = "30m",  # 保留參數避免 API 破壞，但不傳給 oc-mirror
    pull_secret: str = "/root/pull-secret",
    force_refresh: bool = False,
) -> dict:
    """
    查詢指定 operator 的頻道與版本。
    優先回傳本地快取；若 force_refresh=True 或快取不存在則呼叫 oc-mirror。
    """
    # ── 快取命中 ──────────────────────────────────────────────────────
    if not force_refresh:
        cached = get_package(ocp_version, operator_name)
        if cached:
            return {
                "success": True,
                "channels": cached["channels"],
                "from_cache": True,
                "cached_at": cached["cached_at"],
            }

    # ── 呼叫 oc-mirror ────────────────────────────────────────────────
    catalog = f"registry.redhat.io/redhat/redhat-operator-index:v{ocp_version}"
    cmd = [
        "oc-mirror",
        "list",
        "operators",
        f"--catalog={catalog}",
        f"--package={operator_name}",
    ]

    def _run() -> subprocess.CompletedProcess:
        env = dict(os.environ)
        if pull_secret and Path(pull_secret).exists():
            env["REGISTRY_AUTH_FILE"] = pull_secret
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _run)
    except FileNotFoundError:
        return {
            "success": False,
            "error": "找不到 oc-mirror，請確認已安裝並在 PATH 中。",
            "channels": [],
            "from_cache": False,
        }

    out = result.stdout.decode("utf-8", errors="replace")
    err = result.stderr.decode("utf-8", errors="replace")

    if result.returncode != 0:
        return {
            "success": False,
            "error": err or "oc-mirror 執行失敗",
            "channels": [],
            "from_cache": False,
        }

    channels = _parse_channels(out)

    # ── 寫入快取 ──────────────────────────────────────────────────────
    if channels:
        set_package(ocp_version, operator_name, channels)

    return {
        "success": True,
        "raw": out,
        "channels": channels,
        "from_cache": False,
    }


def _parse_channels(output: str) -> List[dict]:
    """
    解析 oc-mirror list operators --package=<name> 的輸出。

    範例輸出：
    NAME                         DISPLAY NAME     DEFAULT CHANNEL
    kubevirt-hyperconverged      KubeVirt HCO     stable

    Package: kubevirt-hyperconverged
    CHANNEL         HEAD
    stable          kubevirt-hyperconverged.v4.20.4
    stable-4.20     kubevirt-hyperconverged.v4.20.4
    """
    channels: List[dict] = []
    in_channel_section = False

    for line in output.splitlines():
        stripped = line.strip()

        # 找到 CHANNEL / HEAD 標題行，之後才是資料
        if re.match(r"CHANNEL\s+HEAD", stripped, re.IGNORECASE):
            in_channel_section = True
            continue

        if in_channel_section:
            if not stripped:
                in_channel_section = False
                continue
            parts = stripped.split()
            if len(parts) >= 2:
                channel_name = parts[0]
                head_bundle = parts[1]  # e.g. kubevirt-hyperconverged.v4.20.4
                # 從 bundle 名稱擷取版本號（.v 後面的部分）
                if ".v" in head_bundle:
                    version = head_bundle.split(".v", 1)[-1]
                else:
                    version = head_bundle
                channels.append(
                    {
                        "channel": channel_name,
                        "head_version": version,
                        "head_bundle": head_bundle,
                    }
                )

    return channels


async def list_catalog_operators(
    ocp_version: str = "4.20",
    pull_secret: str = "/root/pull-secret",
    force_refresh: bool = False,
) -> dict:
    """
    列出指定 catalog 的所有 Operator（不加 --package）。
    優先回傳本地快取；若 force_refresh=True 或快取不存在則呼叫 oc-mirror。
    """
    catalog = f"registry.redhat.io/redhat/redhat-operator-index:v{ocp_version}"

    # ── 快取命中 ──────────────────────────────────────────────────────
    if not force_refresh:
        cached = get_catalog(ocp_version)
        if cached:
            return {
                "success": True,
                "catalog": catalog,
                "total": cached["total"],
                "operators": cached["operators"],
                "from_cache": True,
                "cached_at": cached["cached_at"],
            }

    # ── 呼叫 oc-mirror ────────────────────────────────────────────────
    cmd = [
        "oc-mirror",
        "list",
        "operators",
        f"--catalog={catalog}",
    ]

    def _run() -> subprocess.CompletedProcess:
        env = dict(os.environ)
        if pull_secret and Path(pull_secret).exists():
            env["REGISTRY_AUTH_FILE"] = pull_secret
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _run)
    except FileNotFoundError:
        return {
            "success": False,
            "error": "找不到 oc-mirror，請確認已安裝並在 PATH 中。",
            "catalog": catalog,
            "total": 0,
            "operators": [],
            "from_cache": False,
        }

    out = result.stdout.decode("utf-8", errors="replace")
    err = result.stderr.decode("utf-8", errors="replace")

    if result.returncode != 0:
        return {
            "success": False,
            "error": err or "oc-mirror 執行失敗",
            "catalog": catalog,
            "total": 0,
            "operators": [],
            "from_cache": False,
        }

    operators = _parse_catalog_list(out)

    # ── 寫入快取 ──────────────────────────────────────────────────────
    if operators:
        set_catalog(ocp_version, operators)

    return {
        "success": True,
        "catalog": catalog,
        "total": len(operators),
        "operators": operators,
        "from_cache": False,
    }


def _parse_catalog_list(output: str) -> List[dict]:
    """
    解析 oc-mirror list operators --catalog=... （不加 --package）的輸出。

    範例輸出（欄位以空白對齊）：
    NAME                                        DISPLAY NAME                              DEFAULT CHANNEL
    3scale-operator                             Red Hat Integration - 3scale              threescale-2.13
    ack-cloudwatch-controller                   AWS Controllers for Kubernetes            alpha
    """
    operators: List[dict] = []
    lines = output.splitlines()

    # 尋找標題行（含 NAME 和 DISPLAY NAME）
    header_idx = None
    for i, line in enumerate(lines):
        if re.match(r"\s*NAME\s+DISPLAY", line, re.IGNORECASE):
            header_idx = i
            break

    if header_idx is None:
        return operators

    header = lines[header_idx]
    header_upper = header.upper()

    try:
        name_start = header_upper.index("NAME")
        display_start = header_upper.index("DISPLAY NAME")
        channel_start = header_upper.index("DEFAULT CHANNEL")
    except ValueError:
        return operators

    for line in lines[header_idx + 1:]:
        if not line.strip():
            continue
        line_len = len(line)
        name = (
            line[name_start:display_start].strip()
            if line_len > display_start
            else line[name_start:].strip()
        )
        display_name = (
            line[display_start:channel_start].strip()
            if line_len > channel_start
            else (line[display_start:].strip() if line_len > display_start else "")
        )
        default_channel = line[channel_start:].strip() if line_len > channel_start else ""

        if name:
            operators.append(
                {
                    "name": name,
                    "display_name": display_name,
                    "default_channel": default_channel,
                }
            )

    return operators


def _pick_best_channel(channels: List[dict], default_channel: str) -> Optional[dict]:
    """
    從 package 的頻道清單中挑選最佳頻道：
    1. 優先使用 default_channel（與 catalog 清單的 default_channel 相符）
    2. 其次找名稱含 'stable' 的頻道
    3. 最後 fallback 到第一個頻道
    回傳 {channel, head_version, head_bundle} 或 None
    """
    if not channels:
        return None
    # 完全符合 default_channel
    for ch in channels:
        if ch.get("channel") == default_channel:
            return ch
    # 包含 stable
    for ch in channels:
        if "stable" in ch.get("channel", ""):
            return ch
    return channels[0]


def add_or_update_operator(
    imageset: dict,
    operator_name: str,
    channel: str,
    version: str = "",
    catalog_tag: str = "v4.20",
) -> dict:
    """
    在 imageset dict 中新增或更新一個 operator package。
    version 為空字串時不鎖定版本（oc-mirror 自動取最新），
    適合「快速加入」場景。
    """
    catalog_url = f"registry.redhat.io/redhat/redhat-operator-index:{catalog_tag}"
    operators_list: List[dict] = imageset["mirror"].get("operators", [])

    # 找到對應 catalog 的 entry
    catalog_entry = None
    for entry in operators_list:
        if entry.get("catalog") == catalog_url:
            catalog_entry = entry
            break

    if catalog_entry is None:
        catalog_entry = {"catalog": catalog_url, "packages": []}
        operators_list.append(catalog_entry)
        imageset["mirror"]["operators"] = operators_list

    packages: List[dict] = catalog_entry.get("packages", [])

    # 建立 channel entry：version 為空則不鎖版本
    if version:
        new_channel: dict = {"name": channel, "minVersion": version, "maxVersion": version}
    else:
        new_channel = {"name": channel}

    # 找到同名 package
    pkg = next((p for p in packages if p["name"] == operator_name), None)

    if pkg is None:
        packages.append({"name": operator_name, "channels": [new_channel]})
    else:
        existing_channels = pkg.get("channels", [])
        ch = next((c for c in existing_channels if c["name"] == channel), None)
        if ch is None:
            existing_channels.append(new_channel)
        else:
            ch.pop("minVersion", None)
            ch.pop("maxVersion", None)
            if version:
                ch["minVersion"] = version
                ch["maxVersion"] = version
        pkg["channels"] = existing_channels

    catalog_entry["packages"] = packages
    return imageset


def remove_operator(imageset: dict, operator_name: str, catalog_tag: str = "v4.20") -> dict:
    """從 imageset 中移除指定 operator。"""
    catalog_url = f"registry.redhat.io/redhat/redhat-operator-index:{catalog_tag}"
    for entry in imageset["mirror"].get("operators", []):
        if entry.get("catalog") == catalog_url:
            entry["packages"] = [
                p for p in entry.get("packages", []) if p["name"] != operator_name
            ]
    return imageset
