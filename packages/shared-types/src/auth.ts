export interface LoginCredentials {
  passport: string
  password: string
}

export interface AuthStatus {
  authenticated: boolean
  account?: string
  nickname?: string
  avatar?: string
}

export type QrLoginStateStatus = 'waiting' | 'scanned' | 'logging' | 'cancelled' | 'expired'

export interface QrLoginState {
  status: QrLoginStateStatus
  message?: string
}
