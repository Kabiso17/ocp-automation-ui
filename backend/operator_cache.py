"""
operator_cache.py
-----------------
SQLite 本地快取：儲存 oc-mirror list operators 的查詢結果。
避免每次都要重新拉取 catalog index（需要數分鐘）。

資料庫位置：$LOG_DIR/operator-cache.db（預設 /tmp/ocp-logs/operator-cache.db）
實際部署時 LOG_DIR=/root/ocp-automation-ui/logs，資料庫會持久保存。
"""

import json
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

_LOG_DIR = Path(os.getenv("LOG_DIR", "/tmp/ocp-logs"))
CACHE_DB = _LOG_DIR / "operator-cache.db"

# 預設 TTL
CATALOG_TTL_DAYS = 7
PACKAGE_TTL_DAYS = 3


# ── 資料庫初始化 ──────────────────────────────────────────────────────

def _connect() -> sqlite3.Connection:
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CACHE_DB), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init() -> None:
    with _connect() as conn:
        # 建立基礎資料表
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS catalog_cache (
                ocp_version  TEXT PRIMARY KEY,
                cached_at    TEXT NOT NULL,
                operators    TEXT NOT NULL   -- JSON array
            );

            CREATE TABLE IF NOT EXISTS package_cache (
                ocp_version  TEXT NOT NULL,
                package_name TEXT NOT NULL,
                cached_at    TEXT NOT NULL,
                channels     TEXT NOT NULL,  -- JSON array
                PRIMARY KEY (ocp_version, package_name)
            );
        """)

        # 遷移：檢查是否需要加入 expires_at 欄位
        cursor = conn.execute("PRAGMA table_info(catalog_cache)")
        cols = [row["name"] for row in cursor.fetchall()]
        if "expires_at" not in cols:
            conn.execute("ALTER TABLE catalog_cache ADD COLUMN expires_at TEXT")
            # 為舊資料填入一個已過期的時間，強迫更新
            past = (datetime.now() - timedelta(days=1)).isoformat()
            conn.execute("UPDATE catalog_cache SET expires_at = ?", (past,))

        cursor = conn.execute("PRAGMA table_info(package_cache)")
        cols = [row["name"] for row in cursor.fetchall()]
        if "expires_at" not in cols:
            conn.execute("ALTER TABLE package_cache ADD COLUMN expires_at TEXT")
            past = (datetime.now() - timedelta(days=1)).isoformat()
            conn.execute("UPDATE package_cache SET expires_at = ?", (past,))


# ── Catalog 快取（整個 catalog 的 operator 清單）─────────────────────

def get_catalog(ocp_version: str) -> Optional[Dict[str, Any]]:
    _init()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM catalog_cache WHERE ocp_version = ?",
            (ocp_version,),
        ).fetchone()
    if not row:
        return None

    # 檢查過期
    expires_at = row["expires_at"]
    if expires_at:
        try:
            if datetime.now() > datetime.fromisoformat(expires_at):
                return None
        except ValueError:
            return None

    operators = json.loads(row["operators"])
    return {
        "from_cache": True,
        "cached_at": row["cached_at"],
        "expires_at": expires_at,
        "ocp_version": ocp_version,
        "total": len(operators),
        "operators": operators,
    }


def set_catalog(ocp_version: str, operators: List[Dict]) -> None:
    _init()
    now = datetime.now()
    expires = now + timedelta(days=CATALOG_TTL_DAYS)
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO catalog_cache 
               (ocp_version, cached_at, expires_at, operators) 
               VALUES (?, ?, ?, ?)""",
            (
                ocp_version,
                now.isoformat(),
                expires.isoformat(),
                json.dumps(operators, ensure_ascii=False),
            ),
        )


# ── Package 快取（單一 operator 的頻道/版本資訊）──────────────────────

def get_package(ocp_version: str, package_name: str) -> Optional[Dict[str, Any]]:
    _init()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM package_cache WHERE ocp_version = ? AND package_name = ?",
            (ocp_version, package_name),
        ).fetchone()
    if not row:
        return None

    # 檢查過期
    expires_at = row["expires_at"]
    if expires_at:
        try:
            if datetime.now() > datetime.fromisoformat(expires_at):
                return None
        except ValueError:
            return None

    return {
        "from_cache": True,
        "cached_at": row["cached_at"],
        "expires_at": expires_at,
        "channels": json.loads(row["channels"]),
    }


def set_package(ocp_version: str, package_name: str, channels: List[Dict]) -> None:
    _init()
    now = datetime.now()
    expires = now + timedelta(days=PACKAGE_TTL_DAYS)
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO package_cache
               (ocp_version, package_name, cached_at, expires_at, channels)
               VALUES (?, ?, ?, ?, ?)""",
            (
                ocp_version,
                package_name,
                now.isoformat(),
                expires.isoformat(),
                json.dumps(channels, ensure_ascii=False),
            ),
        )


# ── 快取統計 ──────────────────────────────────────────────────────────

def get_stats() -> Dict[str, Any]:
    _init()
    with _connect() as conn:
        catalog_rows = conn.execute(
            """SELECT ocp_version, cached_at, expires_at,
                      json_array_length(operators) AS operator_count
               FROM catalog_cache ORDER BY cached_at DESC"""
        ).fetchall()
        package_rows = conn.execute(
            """SELECT ocp_version, package_name, cached_at, expires_at
               FROM package_cache ORDER BY cached_at DESC"""
        ).fetchall()
    return {
        "catalog_entries": [dict(r) for r in catalog_rows],
        "package_entries": [dict(r) for r in package_rows],
        "catalog_count": len(catalog_rows),
        "package_count": len(package_rows),
        "db_path": str(CACHE_DB),
    }


# ── 清除快取 ──────────────────────────────────────────────────────────

def clear_cache(ocp_version: Optional[str] = None) -> int:
    """清除快取。若指定 ocp_version 只清該版本，否則全清。回傳刪除筆數。"""
    _init()
    total = 0
    with _connect() as conn:
        if ocp_version:
            total += conn.execute(
                "DELETE FROM catalog_cache WHERE ocp_version = ?", (ocp_version,)
            ).rowcount
            total += conn.execute(
                "DELETE FROM package_cache WHERE ocp_version = ?", (ocp_version,)
            ).rowcount
        else:
            total += conn.execute("DELETE FROM catalog_cache").rowcount
            total += conn.execute("DELETE FROM package_cache").rowcount
    return total
