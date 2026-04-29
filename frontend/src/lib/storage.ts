/**
 * Unified storage abstraction.
 * localStorage is always the working copy (fast, synchronous reads).
 * Every write is also pushed asynchronously to the configured backend.
 */

export type StorageProvider = 'local' | 'filesystem' | 'onedrive' | 'googledrive'

export interface StorageConfig {
  provider: StorageProvider
  // filesystem
  fsDirectoryName?: string
  // onedrive
  oneDriveClientId?: string
  oneDriveTenantId?: string
  oneDriveFolderPath?: string
  oneDriveConnected?: boolean
  // googledrive
  googleClientId?: string
  googleFolderId?: string
  googleFolderName?: string
  googleConnected?: boolean
}

// ── IndexedDB keys (for persisting FileSystem handle) ────────────
const FS_DB_NAME    = 'pl_fs_storage'
const FS_STORE      = 'handles'
const FS_HANDLE_KEY = 'root'

// ── Session-storage token keys ───────────────────────────────────
const OD_TOKEN_KEY = '__pl_od_token__'
const GD_TOKEN_KEY = '__pl_gd_token__'

// ── Config key (stored in localStorage itself) ───────────────────
const CONFIG_KEY = '__pl_storage_config__'

let _fsHandle: FileSystemDirectoryHandle | null = null

// ── Config ───────────────────────────────────────────────────────
export function getConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? { provider: 'local', ...JSON.parse(raw) } : { provider: 'local' }
  } catch { return { provider: 'local' } }
}

export function setConfig(cfg: StorageConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

// ── Main synchronous API (reads always from localStorage) ────────
export function readData(key: string): string | null {
  return localStorage.getItem(key)
}

export function writeData(key: string, value: string): void {
  localStorage.setItem(key, value)
  void _syncWrite(key, value)
}

export function removeData(key: string): void {
  localStorage.removeItem(key)
  void _syncRemove(key)
}

// ── Initialise (restores FileSystem handle from IndexedDB) ───────
export async function initStorage(): Promise<void> {
  const cfg = getConfig()
  if (cfg.provider !== 'filesystem') return
  _fsHandle = await _loadFsHandle()
  if (_fsHandle) {
    try {
      // Request permission if the browser supports it
      const perm = await (_fsHandle as any).requestPermission?.({ mode: 'readwrite' })
      if (perm === 'denied') _fsHandle = null
    } catch { /* browsers that don't expose requestPermission — keep the handle */ }
  }
}

// ── File System Access API ───────────────────────────────────────
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window
}

export async function pickLocalFolder(): Promise<string> {
  if (!isFileSystemSupported()) {
    throw new Error(
      'File System Access API is not supported in this browser. Please use Chrome or Edge.'
    )
  }
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  _fsHandle = handle
  await _saveFsHandle(handle)
  return handle.name as string
}

export async function clearLocalFolder(): Promise<void> {
  _fsHandle = null
  const db = await _openFsDb()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(FS_STORE, 'readwrite')
    tx.objectStore(FS_STORE).delete(FS_HANDLE_KEY)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

// ── OneDrive (Microsoft Graph, implicit-flow popup) ──────────────
export async function connectOneDrive(
  clientId: string,
  tenantId = 'common'
): Promise<boolean> {
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'token',
    redirect_uri:  window.location.origin,
    scope:         'Files.ReadWrite',
    nonce:         crypto.randomUUID(),
    prompt:        'select_account',
  })
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`
  return _oauthPopup(url, OD_TOKEN_KEY, 'onedrive-auth')
}

export function isOneDriveConnected(): boolean {
  return !!sessionStorage.getItem(OD_TOKEN_KEY)
}

export function disconnectOneDrive(): void {
  sessionStorage.removeItem(OD_TOKEN_KEY)
}

// ── Google Drive (OAuth2, implicit-flow popup) ───────────────────
export async function connectGoogleDrive(clientId: string): Promise<boolean> {
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'token',
    redirect_uri:  window.location.origin,
    scope:         'https://www.googleapis.com/auth/drive.file',
    prompt:        'select_account',
  })
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  return _oauthPopup(url, GD_TOKEN_KEY, 'google-auth')
}

export function isGoogleDriveConnected(): boolean {
  return !!sessionStorage.getItem(GD_TOKEN_KEY)
}

export function disconnectGoogleDrive(): void {
  sessionStorage.removeItem(GD_TOKEN_KEY)
}

// ── Sync dispatch ────────────────────────────────────────────────
async function _syncWrite(key: string, value: string): Promise<void> {
  const { provider } = getConfig()
  if (provider === 'filesystem')  await _writeFs(key, value)
  else if (provider === 'onedrive')    await _writeOneDrive(key, value)
  else if (provider === 'googledrive') await _writeGoogleDrive(key, value)
}

async function _syncRemove(key: string): Promise<void> {
  const { provider } = getConfig()
  if (provider === 'filesystem') await _removeFs(key)
}

// ── FileSystem adapter ───────────────────────────────────────────
async function _writeFs(key: string, value: string): Promise<void> {
  if (!_fsHandle) return
  try {
    const fh = await _fsHandle.getFileHandle(`${key}.json`, { create: true })
    const writable = await (fh as any).createWritable()
    await writable.write(value)
    await writable.close()
  } catch (e) { console.warn('[storage] FS write error', e) }
}

async function _removeFs(key: string): Promise<void> {
  if (!_fsHandle) return
  try { await _fsHandle.removeEntry(`${key}.json`) } catch { /* ok if not found */ }
}

function _openFsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(FS_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function _saveFsHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await _openFsDb()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(FS_STORE, 'readwrite')
    tx.objectStore(FS_STORE).put(handle, FS_HANDLE_KEY)
    tx.oncomplete = () => res()
    tx.onerror    = () => rej(tx.error)
  })
}

async function _loadFsHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await _openFsDb()
    return new Promise(resolve => {
      const req = db.transaction(FS_STORE, 'readonly').objectStore(FS_STORE).get(FS_HANDLE_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror   = () => resolve(null)
    })
  } catch { return null }
}

// ── OneDrive adapter ─────────────────────────────────────────────
async function _writeOneDrive(key: string, value: string): Promise<void> {
  const token = sessionStorage.getItem(OD_TOKEN_KEY)
  if (!token) return
  const cfg    = getConfig()
  const folder = cfg.oneDriveFolderPath?.trim() || 'ProcureLink'
  await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${folder}/${key}.json:/content`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    value,
    }
  ).catch(e => console.warn('[storage] OneDrive write error', e))
}

// ── Google Drive adapter ─────────────────────────────────────────
async function _writeGoogleDrive(key: string, value: string): Promise<void> {
  const token = sessionStorage.getItem(GD_TOKEN_KEY)
  if (!token) return
  const cfg  = getConfig()
  const name = `${key}.json`
  const q    = cfg.googleFolderId
    ? `name='${name}' and '${cfg.googleFolderId}' in parents and trashed=false`
    : `name='${name}' and trashed=false`

  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).catch(() => null)

  if (!search?.ok) return
  const { files } = await search.json()

  if (files?.[0]?.id) {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    value,
      }
    ).catch(e => console.warn('[storage] GDrive update error', e))
  } else {
    const meta: Record<string, unknown> = { name }
    if (cfg.googleFolderId) meta.parents = [cfg.googleFolderId]
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
    form.append('file',     new Blob([value],                { type: 'application/json' }))
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    ).catch(e => console.warn('[storage] GDrive create error', e))
  }
}

// ── OAuth popup helper ───────────────────────────────────────────
function _oauthPopup(
  url: string,
  tokenKey: string,
  windowName: string
): Promise<boolean> {
  return new Promise(resolve => {
    const popup = window.open(url, windowName, 'width=600,height=700,left=200,top=100')
    if (!popup) { resolve(false); return }

    const poll = setInterval(() => {
      try {
        const hash = new URLSearchParams(popup.location.hash.slice(1))
        const token = hash.get('access_token')
        if (token) {
          sessionStorage.setItem(tokenKey, token)
          clearInterval(poll)
          popup.close()
          resolve(true)
        }
      } catch { /* cross-origin — keep polling until popup closes */ }
      if (popup.closed) { clearInterval(poll); resolve(false) }
    }, 500)

    setTimeout(() => { clearInterval(poll); popup?.close(); resolve(false) }, 120_000)
  })
}
