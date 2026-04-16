from pydantic import BaseModel, Field
from typing import List, Optional


class NodeConfig(BaseModel):
    name: str
    ip: str = ""


class SiteConfig(BaseModel):
    # Ansible EE
    ee_image_name: str = "eeimage"
    ocp_installer_dir: str = "/root/OpenShift-Automation/roles/ocp_bastion_installer"

    # AAP
    aap_repo: str = "ansible-automation-platform-2.6-for-rhel-9-x86_64-rpms"
    aap_dir: str = "/root/rpm"
    rhel_minor_version: str = "9.6"

    # Versions
    ocp_release: str = "4.20.8"
    rhel_version: str = "rhel9"
    architecture: str = "amd64"
    helm_version: str = "3.17.1"
    mirror_registry_version: str = "latest"

    # CSI
    csi_type: str = "nfs-csi"
    trident_installer: str = "25.02.1"

    # Install mode
    install_mode: str = "compact"

    # Cluster info
    cluster_domain: str = ""
    base_domain: str = ""

    # Node IPs
    bastion_ip: str = ""
    bootstrap_ip: str = ""
    master_nodes: List[NodeConfig] = Field(default_factory=lambda: [
        NodeConfig(name="master01"), NodeConfig(name="master02"), NodeConfig(name="master03")
    ])
    infra_nodes: List[NodeConfig] = Field(default_factory=lambda: [
        NodeConfig(name="infra01"), NodeConfig(name="infra02"), NodeConfig(name="infra03")
    ])
    worker_nodes: List[NodeConfig] = Field(default_factory=lambda: [
        NodeConfig(name="worker01"), NodeConfig(name="worker02"), NodeConfig(name="worker03")
    ])

    # Auth
    registry_password: str = "P@ssw0rd"
    ocp_admin: str = "ocpadmin"

    # Gitea
    gitea_version: str = "1.21.7"
    gitea_admin: str = "gitadmin"
    gitea_password: str = "P@ssw0rd"

    # GitOps
    gitops_cluster_type: str = "standard-with-virt"
    argocd_install_mode: str = "spoke"
    git_revision: str = "main"

    # NFS CSI
    nfs_storage_class_name: str = "nfs-storage"
    nfs_namespace: str = "nfs-provisioner"

    # Trident CSI
    trident_storage_class_name: str = "netapp-nas-nfs3"
    trident_namespace: str = "trident"
    backend_type: str = "ontap-nas"
    backend_name: str = "NetApp-nfs"
    storage_driver_name: str = "ontap-nas"
    management_lif: str = ""
    data_lif: str = ""
    svm: str = ""
    ontap_username: str = ""
    ontap_password: str = ""


class PhaseStatus(BaseModel):
    phase: str
    status: str  # pending | running | success | failed
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    exit_code: Optional[int] = None
    log_lines: int = 0


class ValidationResult(BaseModel):
    valid: bool
    errors: List[str] = []


# ──────────────────────────────────────────
# ImageSet 相關 Models
# ──────────────────────────────────────────

class OperatorChannelResult(BaseModel):
    channel: str
    head_version: str
    head_bundle: str


class OperatorSearchResult(BaseModel):
    success: bool
    error: Optional[str] = None
    raw: Optional[str] = None
    channels: List[OperatorChannelResult] = []


class OperatorSearchRequest(BaseModel):
    operator_name: str
    ocp_version: str = "4.20"
    image_timeout: str = "30m"


class AddOperatorRequest(BaseModel):
    operator_name: str
    channel: str
    version: str
    catalog_tag: str = "v4.20"


class RemoveOperatorRequest(BaseModel):
    operator_name: str
    catalog_tag: str = "v4.20"
