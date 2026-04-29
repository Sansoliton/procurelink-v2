import { useState, useEffect } from 'react'
import {
  HardDrive, Cloud, FolderOpen, CheckCircle2, AlertCircle,
  Settings, Unlink, RefreshCw,
} from 'lucide-react'
import { Button, Card } from '@/components/ui'
import {
  getConfig, setConfig, StorageConfig, StorageProvider,
  isFileSystemSupported, pickLocalFolder, clearLocalFolder,
  connectOneDrive, isOneDriveConnected, disconnectOneDrive,
  connectGoogleDrive, isGoogleDriveConnected, disconnectGoogleDrive,
  initStorage,
} from '@/lib/storage'

const PROVIDERS: { id: StorageProvider; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id:    'local',
    label: 'Browser Storage',
    desc:  'Data stored in this browser only. No sync. Works everywhere.',
    icon:  <HardDrive className="w-5 h-5" />,
  },
  {
    id:    'filesystem',
    label: 'Local Folder',
    desc:  'Saves JSON files to a folder on this computer. Chrome / Edge only.',
    icon:  <FolderOpen className="w-5 h-5" />,
  },
  {
    id:    'onedrive',
    label: 'OneDrive',
    desc:  'Syncs to a Microsoft OneDrive folder via Microsoft Graph API.',
    icon:  <Cloud className="w-5 h-5 text-blue-500" />,
  },
  {
    id:    'googledrive',
    label: 'Google Drive',
    desc:  'Syncs to a Google Drive folder via Google Drive API.',
    icon:  <Cloud className="w-5 h-5 text-green-500" />,
  },
]

export default function StoragePage() {
  const [cfg, setCfg]         = useState<StorageConfig>(getConfig)
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [fsWorking, setFsWorking] = useState(false)
  const [odWorking, setOdWorking] = useState(false)
  const [gdWorking, setGdWorking] = useState(false)

  // live connection state
  const [odConnected, setOdConnected] = useState(isOneDriveConnected)
  const [gdConnected, setGdConnected] = useState(isGoogleDriveConnected)

  useEffect(() => { setOdConnected(isOneDriveConnected()) }, [cfg.provider])
  useEffect(() => { setGdConnected(isGoogleDriveConnected()) }, [cfg.provider])

  function patch(partial: Partial<StorageConfig>) {
    setCfg(prev => ({ ...prev, ...partial }))
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      setConfig(cfg)
      await initStorage()
      setStatus({ ok: true, msg: 'Storage settings saved.' })
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message ?? 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  async function handlePickFolder() {
    setFsWorking(true)
    setStatus(null)
    try {
      const name = await pickLocalFolder()
      patch({ fsDirectoryName: name })
      setStatus({ ok: true, msg: `Folder "${name}" selected.` })
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message ?? 'Could not open folder.' })
    } finally {
      setFsWorking(false)
    }
  }

  async function handleClearFolder() {
    await clearLocalFolder()
    patch({ fsDirectoryName: undefined })
    setStatus({ ok: true, msg: 'Folder link removed.' })
  }

  async function handleConnectOneDrive() {
    if (!cfg.oneDriveClientId?.trim()) {
      setStatus({ ok: false, msg: 'Enter your Azure App (client) ID first.' })
      return
    }
    setOdWorking(true)
    setStatus(null)
    const ok = await connectOneDrive(cfg.oneDriveClientId, cfg.oneDriveTenantId || 'common')
    setOdConnected(ok)
    setStatus(ok
      ? { ok: true,  msg: 'OneDrive connected successfully.' }
      : { ok: false, msg: 'OneDrive sign-in cancelled or failed.' }
    )
    setOdWorking(false)
  }

  function handleDisconnectOneDrive() {
    disconnectOneDrive()
    setOdConnected(false)
    setStatus({ ok: true, msg: 'OneDrive disconnected.' })
  }

  async function handleConnectGoogleDrive() {
    if (!cfg.googleClientId?.trim()) {
      setStatus({ ok: false, msg: 'Enter your Google OAuth Client ID first.' })
      return
    }
    setGdWorking(true)
    setStatus(null)
    const ok = await connectGoogleDrive(cfg.googleClientId)
    setGdConnected(ok)
    setStatus(ok
      ? { ok: true,  msg: 'Google Drive connected successfully.' }
      : { ok: false, msg: 'Google sign-in cancelled or failed.' }
    )
    setGdWorking(false)
  }

  function handleDisconnectGoogleDrive() {
    disconnectGoogleDrive()
    setGdConnected(false)
    setStatus({ ok: true, msg: 'Google Drive disconnected.' })
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1>Storage Settings</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Choose where quotation, customer, and invoice data is stored.
        Browser storage is always used as the working copy — the selected
        backend is synced automatically on every save.
      </p>

      {/* Provider picker */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => patch({ provider: p.id })}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              cfg.provider === p.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-blue-200 bg-white'
            }`}
          >
            <span className={cfg.provider === p.id ? 'text-blue-600' : 'text-gray-400'}>
              {p.icon}
            </span>
            <div>
              <p className={`text-sm font-semibold ${cfg.provider === p.id ? 'text-blue-700' : 'text-gray-800'}`}>
                {p.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{p.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* FileSystem config */}
      {cfg.provider === 'filesystem' && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Local Folder</h3>
          {!isFileSystemSupported() && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3 mb-3">
              File System Access API is not available in this browser.
              Please use Chrome 86+ or Edge 86+.
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              {cfg.fsDirectoryName
                ? <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5 text-blue-500" />{cfg.fsDirectoryName}</span>
                : <span className="text-gray-400">No folder selected</span>
              }
            </div>
            <Button variant="ghost" onClick={handlePickFolder} loading={fsWorking} disabled={!isFileSystemSupported()}>
              Browse…
            </Button>
            {cfg.fsDirectoryName && (
              <button onClick={handleClearFolder} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                <Unlink className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Each data key is saved as a separate <code>.json</code> file in this folder.
          </p>
        </Card>
      )}

      {/* OneDrive config */}
      {cfg.provider === 'onedrive' && (
        <Card className="mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">OneDrive (Microsoft Graph)</h3>
          <p className="text-xs text-gray-400">
            Register an app in{' '}
            <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Azure AD
            </a>
            {' '}with <code>Files.ReadWrite</code> scope and your origin as a redirect URI.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Azure App (Client) ID *</label>
            <input className="input-base" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={cfg.oneDriveClientId ?? ''} onChange={e => patch({ oneDriveClientId: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tenant ID <span className="text-gray-400">(leave blank for personal accounts)</span></label>
            <input className="input-base" placeholder="common"
              value={cfg.oneDriveTenantId ?? ''} onChange={e => patch({ oneDriveTenantId: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Folder path in OneDrive <span className="text-gray-400">(default: ProcureLink)</span></label>
            <input className="input-base" placeholder="ProcureLink"
              value={cfg.oneDriveFolderPath ?? ''} onChange={e => patch({ oneDriveFolderPath: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 pt-1">
            {odConnected
              ? <>
                  <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                  <Button variant="ghost" onClick={handleDisconnectOneDrive}>
                    <Unlink className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                </>
              : <Button variant="primary" onClick={handleConnectOneDrive} loading={odWorking}>
                  <RefreshCw className="w-3.5 h-3.5" /> Sign in with Microsoft
                </Button>
            }
          </div>
        </Card>
      )}

      {/* Google Drive config */}
      {cfg.provider === 'googledrive' && (
        <Card className="mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Google Drive</h3>
          <p className="text-xs text-gray-400">
            Create OAuth 2.0 credentials in{' '}
            <a href="https://console.cloud.google.com/apis/credentials"
              target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Google Cloud Console
            </a>
            {' '}with <code>drive.file</code> scope and your origin as an authorised JavaScript origin.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Google OAuth Client ID *</label>
            <input className="input-base" placeholder="xxxxxx.apps.googleusercontent.com"
              value={cfg.googleClientId ?? ''} onChange={e => patch({ googleClientId: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Drive folder ID <span className="text-gray-400">(optional — saves to root if blank)</span></label>
            <input className="input-base" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              value={cfg.googleFolderId ?? ''} onChange={e => patch({ googleFolderId: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 pt-1">
            {gdConnected
              ? <>
                  <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                  <Button variant="ghost" onClick={handleDisconnectGoogleDrive}>
                    <Unlink className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                </>
              : <Button variant="primary" onClick={handleConnectGoogleDrive} loading={gdWorking}>
                  <RefreshCw className="w-3.5 h-3.5" /> Sign in with Google
                </Button>
            }
          </div>
        </Card>
      )}

      {/* Status */}
      {status && (
        <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 mb-4 ${
          status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {status.ok
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle  className="w-4 h-4 flex-shrink-0" />
          }
          {status.msg}
        </div>
      )}

      <Button variant="primary" onClick={handleSave} loading={saving}>
        Save settings
      </Button>
    </div>
  )
}
