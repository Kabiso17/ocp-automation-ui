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
    image_timeout: str = "30m",
) -> dict:
    """
    執行 oc-mirror list operators 查詢指定 operator 的頻道與版本。

    使用 --image-timeout 避免拉取 catalog index 時 timeout。
    """
    catalog = f"registry.redhat.io/redhat/redhat-operator-index:v{ocp_version}"

    # oc-mirror v2 全域 flag 需放在 subcommand 前
    cmd = [
        "oc-mirror",
        f"--image-timeout={image_timeout}",
        "list",
        "operators",
        f"--catalog={catalog}",
        f"--package={operator_name}",
    ]

    def _run() -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _run)
    except FileNotFoundError:
        return {
            "success": False,
            "error": "找不到 oc-mirror，請確認已安裝並在 PATH 中。",
            "channels": [],
        }

    out = result.stdout.decode("utf-8", errors="replace")
    err = result.stderr.decode("utf-8", errors="replace")

    if result.returncode != 0:
        return {
            "success": False,
            "error": err or "oc-mirror 執行失敗",
            "channels": [],
        }

    channels = _parse_channels(out)
    return {
        "success": True,
        "raw": out,
        "channels": channels,
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


def add_or_update_operator(
    imageset: dict,
    operator_name: str,
    channel: str,
    version: str,
    catalog_tag: str = "v4.20",
) -> dict:
    """
    在 imageset dict 中新增或更新一個 operator package。
    如果同名 operator 已存在則覆蓋其 channel 設定。
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

    # 找到同名 package
    pkg = next((p for p in packages if p["name"] == operator_name), None)
    new_channel = {
        "name": channel,
        "minVersion": version,
        "maxVersion": version,
    }

    if pkg is None:
        packages.append({"name": operator_name, "channels": [new_channel]})
    else:
        # 更新或新增 channel
        existing_channels = pkg.get("channels", [])
        ch = next((c for c in existing_channels if c["name"] == channel), None)
        if ch is None:
            existing_channels.append(new_channel)
        else:
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
