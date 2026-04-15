import os
import yaml
from pathlib import Path
from models import SiteConfig, NodeConfig

SITE_VARS_PATH = Path(os.getenv("SITE_VARS_PATH", "/app/vars/site.yml"))


def read_config() -> SiteConfig:
    if not SITE_VARS_PATH.exists():
        return SiteConfig()
    with open(SITE_VARS_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    # Convert node dicts to NodeConfig objects
    for key in ["master_nodes", "infra_nodes", "worker_nodes"]:
        if key in data and isinstance(data[key], list):
            data[key] = [
                NodeConfig(**n) if isinstance(n, dict) else n
                for n in data[key]
            ]
    return SiteConfig(**data)


def write_config(config: SiteConfig) -> None:
    SITE_VARS_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = config.model_dump()

    # Convert NodeConfig objects to dicts
    for key in ["master_nodes", "infra_nodes", "worker_nodes"]:
        data[key] = [{"name": n["name"], "ip": n["ip"]} for n in data[key]]

    with open(SITE_VARS_PATH, "w", encoding="utf-8") as f:
        f.write("---\n# OpenShift Automation - 統一配置檔\n# 由 OCP Automation UI 自動產生\n\n")
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def validate_config(config: SiteConfig) -> list[str]:
    errors = []
    required_fields = [
        ("cluster_domain", "叢集名稱 (cluster_domain)"),
        ("base_domain", "基礎域名 (base_domain)"),
        ("bastion_ip", "Bastion IP"),
        ("bootstrap_ip", "Bootstrap IP"),
    ]
    for field, label in required_fields:
        if not getattr(config, field):
            errors.append(f"{label} 未填寫")

    for node in config.master_nodes:
        if not node.ip:
            errors.append(f"{node.name} IP 未填寫")

    if config.install_mode == "standard":
        for node in config.infra_nodes:
            if not node.ip:
                errors.append(f"{node.name} IP 未填寫")

    if config.csi_type == "trident":
        if not config.management_lif:
            errors.append("Trident Management LIF 未填寫")
        if not config.ontap_username:
            errors.append("ONTAP 帳號未填寫")
        if not config.ontap_password:
            errors.append("ONTAP 密碼未填寫")

    return errors
