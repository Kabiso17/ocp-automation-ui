import { useEffect, useState } from 'react'
import { Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { getConfig, saveConfig } from '../api/client'
import type { SiteConfig } from '../types'
import NodeTable from '../components/NodeTable'

type Tab = 'cluster' | 'nodes' | 'versions' | 'csi' | 'gitops'

const tabList: { key: Tab; label: string }[] = [
  { key: 'cluster',  label: '叢集資訊' },
  { key: 'nodes',    label: '節點配置' },
  { key: 'versions', label: '版本工具' },
  { key: 'csi',      label: 'CSI 儲存' },
  { key: 'gitops',   label: 'GitOps' },
]

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
  hint?: string
}

function Field({ label, value, onChange, placeholder, type = 'text', mono, hint }: FieldProps) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1.5 font-medium">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-ocp-red focus:border-ocp-red ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

interface SelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  hint?: string
}

function Select({ label, value, onChange, options, hint }: SelectProps) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1.5 font-medium">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-ocp-red focus:border-ocp-red"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function Configuration() {
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('cluster')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConfig().then((r) => setConfig(r.data)).catch(() => setError('無法讀取配置'))
  }, [])

  const update = (key: keyof SiteConfig, value: unknown) => {
    if (!config) return
    setConfig({ ...config, [key]: value })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      await saveConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('儲存失敗，請確認 API 連線')
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-slate-400 flex items-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          載入配置中...
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">配置</h1>
          <p className="text-slate-400 mt-1 text-sm">編輯 vars/site.yml — 所有 Phase 共用此設定</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-ocp-red hover:bg-red-700 disabled:opacity-60 text-white rounded-lg transition-colors font-medium text-sm"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saving ? '儲存中...' : saved ? '已儲存' : '儲存'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950 border border-red-700 rounded-lg px-4 py-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {tabList.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'text-white border-ocp-red'
                : 'text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-5">
        {/* 叢集資訊 */}
        {activeTab === 'cluster' && (
          <>
            <Select
              label="安裝模式"
              value={config.install_mode}
              onChange={(v) => update('install_mode', v)}
              options={[
                { value: 'compact', label: 'Compact（3 Master，無 Infra/Worker）' },
                { value: 'standard', label: 'Standard（含 Infra + Worker 節點）' },
              ]}
              hint="compact 適合 PoC；standard 適合正式環境"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="叢集名稱 (cluster_domain)" value={config.cluster_domain} onChange={(v) => update('cluster_domain', v)} placeholder="ocp4" mono />
              <Field label="基礎域名 (base_domain)" value={config.base_domain} onChange={(v) => update('base_domain', v)} placeholder="demo.lab" mono />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="OCP 版本" value={config.ocp_release} onChange={(v) => update('ocp_release', v)} placeholder="4.20.8" mono />
              <Field label="RHEL 版本" value={config.rhel_version} onChange={(v) => update('rhel_version', v)} placeholder="rhel9" mono />
            </div>
            <Select
              label="架構"
              value={config.architecture}
              onChange={(v) => update('architecture', v)}
              options={[
                { value: 'amd64', label: 'amd64 (x86_64)' },
                { value: 'arm64', label: 'arm64 (AArch64)' },
              ]}
            />
            <Field label="Registry 密碼" value={config.registry_password} onChange={(v) => update('registry_password', v)} type="password" />
            <Field label="OCP 管理員帳號" value={config.ocp_admin} onChange={(v) => update('ocp_admin', v)} placeholder="ocpadmin" mono />
          </>
        )}

        {/* 節點配置 */}
        {activeTab === 'nodes' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bastion IP" value={config.bastion_ip} onChange={(v) => update('bastion_ip', v)} placeholder="172.20.11.50" mono />
              <Field label="Bootstrap IP" value={config.bootstrap_ip} onChange={(v) => update('bootstrap_ip', v)} placeholder="172.20.11.60" mono />
            </div>
            <NodeTable label="Master 節點" nodes={config.master_nodes} onChange={(v) => update('master_nodes', v)} />
            {config.install_mode === 'standard' && (
              <NodeTable label="Infra 節點" nodes={config.infra_nodes} onChange={(v) => update('infra_nodes', v)} />
            )}
            <NodeTable label="Worker 節點" nodes={config.worker_nodes} onChange={(v) => update('worker_nodes', v)} />
          </>
        )}

        {/* 版本工具 */}
        {activeTab === 'versions' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="RHEL 小版本" value={config.rhel_minor_version} onChange={(v) => update('rhel_minor_version', v)} placeholder="9.6" mono />
              <Field label="Helm 版本" value={config.helm_version} onChange={(v) => update('helm_version', v)} placeholder="3.17.1" mono />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mirror Registry 版本" value={config.mirror_registry_version} onChange={(v) => update('mirror_registry_version', v)} placeholder="latest" mono />
              <Field label="EE Image 名稱" value={config.ee_image_name} onChange={(v) => update('ee_image_name', v)} placeholder="eeimage" mono />
            </div>
            <Field label="AAP Repo" value={config.aap_repo} onChange={(v) => update('aap_repo', v)} mono />
            <Field label="AAP 下載目錄" value={config.aap_dir} onChange={(v) => update('aap_dir', v)} mono />
          </>
        )}

        {/* CSI */}
        {activeTab === 'csi' && (
          <>
            <Select
              label="CSI 類型"
              value={config.csi_type}
              onChange={(v) => update('csi_type', v)}
              options={[
                { value: 'nfs-csi', label: 'NFS CSI（適合 PoC，不需 NetApp）' },
                { value: 'trident', label: 'Trident（NetApp Storage CSI）' },
              ]}
            />
            {config.csi_type === 'nfs-csi' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="StorageClass 名稱" value={config.nfs_storage_class_name} onChange={(v) => update('nfs_storage_class_name', v)} mono />
                <Field label="Namespace" value={config.nfs_namespace} onChange={(v) => update('nfs_namespace', v)} mono />
              </div>
            )}
            {config.csi_type === 'trident' && (
              <>
                <Field label="Trident 版本" value={config.trident_installer} onChange={(v) => update('trident_installer', v)} placeholder="25.02.1" mono />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="StorageClass 名稱" value={config.trident_storage_class_name} onChange={(v) => update('trident_storage_class_name', v)} mono />
                  <Field label="Namespace" value={config.trident_namespace} onChange={(v) => update('trident_namespace', v)} mono />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Management LIF" value={config.management_lif} onChange={(v) => update('management_lif', v)} placeholder="192.168.x.x" mono />
                  <Field label="Data LIF" value={config.data_lif} onChange={(v) => update('data_lif', v)} placeholder="192.168.x.x" mono />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SVM 名稱" value={config.svm} onChange={(v) => update('svm', v)} mono />
                  <Field label="Backend 名稱" value={config.backend_name} onChange={(v) => update('backend_name', v)} mono />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="ONTAP 帳號" value={config.ontap_username} onChange={(v) => update('ontap_username', v)} mono />
                  <Field label="ONTAP 密碼" value={config.ontap_password} onChange={(v) => update('ontap_password', v)} type="password" />
                </div>
              </>
            )}
          </>
        )}

        {/* GitOps */}
        {activeTab === 'gitops' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gitea 管理員帳號" value={config.gitea_admin} onChange={(v) => update('gitea_admin', v)} mono />
              <Field label="Gitea 管理員密碼" value={config.gitea_password} onChange={(v) => update('gitea_password', v)} type="password" />
            </div>
            <Field label="Gitea 版本" value={config.gitea_version} onChange={(v) => update('gitea_version', v)} placeholder="1.21.7" mono />
            <Select
              label="GitOps 叢集類型"
              value={config.gitops_cluster_type}
              onChange={(v) => update('gitops_cluster_type', v)}
              options={[
                { value: 'standard', label: 'standard' },
                { value: 'standard-with-virt', label: 'standard-with-virt（含虛擬化）' },
                { value: 'platform-with-gpu', label: 'platform-with-gpu（含 GPU）' },
              ]}
            />
            <Select
              label="ArgoCD 安裝模式"
              value={config.argocd_install_mode}
              onChange={(v) => update('argocd_install_mode', v)}
              options={[
                { value: 'spoke', label: 'Spoke（單一叢集）' },
                { value: 'hub', label: 'Hub（多叢集管理中心）' },
              ]}
            />
            <Field label="Git Revision (Branch)" value={config.git_revision} onChange={(v) => update('git_revision', v)} placeholder="main" mono />
          </>
        )}
      </div>
    </div>
  )
}
