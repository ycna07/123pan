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
