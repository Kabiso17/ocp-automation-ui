export interface NodeConfig {
  name: string
  ip: string
}

export interface SiteConfig {
  ee_image_name: string
  ocp_installer_dir: string
  aap_repo: string
  aap_dir: string
  rhel_minor_version: string
  ocp_release: string
  rhel_version: string
  architecture: string
  helm_version: string
  mirror_registry_version: string
  csi_type: string
  trident_installer: string
  install_mode: string
  cluster_domain: string
  base_domain: string
  bastion_ip: string
  bootstrap_ip: string
  master_nodes: NodeConfig[]
  infra_nodes: NodeConfig[]
  worker_nodes: NodeConfig[]
  registry_password: string
  ocp_admin: string
  gitea_version: string
  gitea_admin: string
  gitea_password: string
  gitops_cluster_type: string
  argocd_install_mode: string
  git_revision: string
  nfs_storage_class_name: string
  nfs_namespace: string
  trident_storage_class_name: string
  trident_namespace: string
  backend_type: string
  backend_name: string
  storage_driver_name: string
  management_lif: string
  data_lif: string
  svm: string
  ontap_username: string
  ontap_password: string
}

export interface PhaseStatus {
  phase: string
  status: 'pending' | 'running' | 'success' | 'failed'
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  log_lines: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ──────────────────────────────────────────
// ImageSet 相關 Types
// ──────────────────────────────────────────

export interface ImagesetChannel {
  name: string
  minVersion: string
  maxVersion: string
}

export interface ImagesetPackage {
  name: string
  channels: ImagesetChannel[]
}

export interface ImagesetCatalogEntry {
  catalog: string
  packages: ImagesetPackage[]
}

export interface ImagesetConfig {
  apiVersion: string
  kind: string
  archiveSize: number
  mirror: {
    platform?: {
      channels: { name: string; minVersion: string; maxVersion: string }[]
      graph: boolean
    }
    operators: ImagesetCatalogEntry[]
    additionalImages: { name: string }[]
  }
}

export interface OperatorChannelResult {
  channel: string
  head_version: string
  head_bundle: string
}

export interface OperatorSearchResult {
  success: boolean
  error?: string
  raw?: string
  channels: OperatorChannelResult[]
}

export type PhaseKey = 'prep' | 'install' | 'post' | 'operators'

export interface PhaseInfo {
  key: PhaseKey
  label: string
  tag: string
  description: string
}

export const PHASES: PhaseInfo[] = [
  {
    key: 'prep',
    label: 'Phase 1 — 環境準備',
    tag: '--tags prep',
    description: '下載工具、建立 EE Image、產生 Ansible 設定檔',
  },
  {
    key: 'install',
    label: 'Phase 2 — Day1 安裝',
    tag: '--tags install',
    description: '安裝 ansible-navigator、執行 Bastion 及 OCP 安裝',
  },
  {
    key: 'post',
    label: 'Phase 3 — 安裝後配置',
    tag: '--tags post',
    description: '核准 CSR、配置 Mirror、安裝 CSI、部署 Gitea',
  },
  {
    key: 'operators',
    label: 'Phase 4 — GitOps & Operators',
    tag: '--tags operators',
    description: '建立 GitOps repo、執行 ArgoCD bootstrap、安裝 Operators',
  },
]
