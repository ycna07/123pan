import { ElectronAPI } from '@electron-toolkit/preload'
import type { AuthStatus, LoginCredentials } from '@123pan/shared-types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      login(credentials: LoginCredentials): Promise<AuthStatus>
      getAuthStatus(): Promise<AuthStatus>
      logout(): Promise<void>
    }
  }
}
