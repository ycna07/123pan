import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  AuthStatus,
  DriveItem,
  DownloadProgress,
  DownloadTask,
  QrLoginState,
  StorageUsage,
  UploadProgress
} from '@123pan/shared-types'

// Custom APIs for renderer
const api = {
  login: (credentials: { passport: string; password: string }): Promise<unknown> =>
    ipcRenderer.invoke('auth:login', credentials),
  loginWithCookie: (raw: string): Promise<unknown> => ipcRenderer.invoke('auth:login-cookie', raw),
  qrStart: (): Promise<{ qrUrl: string }> => ipcRenderer.invoke('auth:qr-start'),
  qrStop: (): Promise<void> => ipcRenderer.invoke('auth:qr-stop'),
  getAuthStatus: (): Promise<unknown> => ipcRenderer.invoke('auth:status'),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  listFiles: (folderId: string | null): Promise<DriveItem[]> =>
    ipcRenderer.invoke('drive:list', folderId),
  moveFiles: (fileIds: string[], targetFolderId: string | null): Promise<string[]> =>
    ipcRenderer.invoke('drive:move', fileIds, targetFolderId),
  copyFiles: (fileIds: string[], targetFolderId: string | null): Promise<string[]> =>
    ipcRenderer.invoke('drive:copy', fileIds, targetFolderId),
  getUsage: (): Promise<StorageUsage> => ipcRenderer.invoke('drive:usage'),
  getDownloadLink: (fileId: string): Promise<{ url: string }> =>
    ipcRenderer.invoke('drive:download-link', fileId),
  downloadFile: (fileId: string, name: string, savePath?: string): Promise<unknown> =>
    ipcRenderer.invoke('drive:download', fileId, name, savePath),
  copyDownloadLink: (fileId: string): Promise<string> =>
    ipcRenderer.invoke('drive:copy-link', fileId),
  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: DownloadProgress): void => callback(progress)
    ipcRenderer.on('drive:download-progress', listener)
    return () => ipcRenderer.removeListener('drive:download-progress', listener)
  },
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  chooseDownloadDir: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:choose-download-dir'),
  downloadsList: (): Promise<DownloadTask[]> => ipcRenderer.invoke('drive:downloads:list'),
  cancelDownload: (id: string): Promise<boolean> => ipcRenderer.invoke('drive:download-cancel', id),
  revealDownload: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('drive:downloads:reveal', id),
  onDownloadUpdated: (callback: (task: DownloadTask) => void): (() => void) => {
    const listener = (_event: unknown, task: DownloadTask): void => callback(task)
    ipcRenderer.on('drive:download-updated', listener)
    return () => ipcRenderer.removeListener('drive:download-updated', listener)
  },
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  uploadFile: (filePath: string, parentFolderId: string | null): Promise<unknown> =>
    ipcRenderer.invoke('drive:upload', filePath, parentFolderId),
  createFolder: (parentFolderId: string | null, name: string): Promise<unknown> =>
    ipcRenderer.invoke('drive:mkdir', parentFolderId, name),
  createOfflineTask: (url: string, parentFolderId: string | null): Promise<unknown> =>
    ipcRenderer.invoke('drive:offline', url, parentFolderId),
  onUploadProgress: (callback: (progress: UploadProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: UploadProgress): void => callback(progress)
    ipcRenderer.on('drive:upload-progress', listener)
    return () => ipcRenderer.removeListener('drive:upload-progress', listener)
  },
  onLoginSuccess: (callback: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: AuthStatus): void => callback(status)
    ipcRenderer.on('auth:login-success', listener)
    return () => ipcRenderer.removeListener('auth:login-success', listener)
  },
  onQrStatus: (callback: (state: QrLoginState) => void): (() => void) => {
    const listener = (_event: unknown, state: QrLoginState): void => callback(state)
    ipcRenderer.on('auth:qr-status', listener)
    return () => ipcRenderer.removeListener('auth:qr-status', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
