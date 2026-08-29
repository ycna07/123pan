import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AuthStatus } from '@123pan/shared-types'

// Custom APIs for renderer
const api = {
  login: (credentials: { passport: string; password: string }): Promise<unknown> =>
    ipcRenderer.invoke('auth:login', credentials),
  loginWithCookie: (raw: string): Promise<unknown> => ipcRenderer.invoke('auth:login-cookie', raw),
  openQrLogin: (): Promise<void> => ipcRenderer.invoke('auth:open-qr'),
  getAuthStatus: (): Promise<unknown> => ipcRenderer.invoke('auth:status'),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  onLoginSuccess: (callback: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: AuthStatus): void => callback(status)
    ipcRenderer.on('auth:login-success', listener)
    return () => ipcRenderer.removeListener('auth:login-success', listener)
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
