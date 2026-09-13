export interface LoginCredentials {
  passport: string
  password: string
}

export interface AuthAccount {
  account: string
  nickname?: string
  avatar?: string
  active: boolean
}

export interface AuthStatus {
  authenticated: boolean
  account?: string
  nickname?: string
  avatar?: string
  accounts?: AuthAccount[]
}

export type QrLoginStateStatus = 'waiting' | 'scanned' | 'logging' | 'cancelled' | 'expired'

export interface QrLoginState {
  status: QrLoginStateStatus
  message?: string
}
