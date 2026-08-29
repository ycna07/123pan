import { ElectronAPI } from '@electron-toolkit/preload'
import type { AuthStatus, LoginCredentials, QrLoginState } from '@123pan/shared-types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      login(credentials: LoginCredentials): Promise<AuthStatus>
      loginWithCookie(raw: string): Promise<AuthStatus>
      qrStart(): Promise<{ qrUrl: string }>
      qrStop(): Promise<void>
      getAuthStatus(): Promise<AuthStatus>
      logout(): Promise<void>
      onLoginSuccess(callback: (status: AuthStatus) => void): () => void
      onQrStatus(callback: (state: QrLoginState) => void): () => void
    }
  }
}
