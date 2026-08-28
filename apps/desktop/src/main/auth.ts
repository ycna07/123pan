import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, rm, writeFile } from 'fs/promises'
import { Pan123SDK } from '@sharef/123pan-sdk'
import type { AuthStatus, LoginCredentials } from '@123pan/shared-types'

interface StoredToken {
  account: string
  token: string
  encrypted: boolean
  savedAt: number
}

let sdk: Pan123SDK | null = null
let account: string | null = null

function tokenFilePath(): string {
  return join(app.getPath('userData'), 'auth-token.json')
}

function encryptToken(token: string): { token: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return { token: safeStorage.encryptString(token).toString('base64'), encrypted: true }
  }
  return { token, encrypted: false }
}

function decryptToken(stored: StoredToken): string | null {
  if (!stored.encrypted) return stored.token
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored.token, 'base64'))
  } catch {
    return null
  }
}

async function persistToken(accountName: string, token: string): Promise<void> {
  const payload: StoredToken = { account: accountName, ...encryptToken(token), savedAt: Date.now() }
  await writeFile(tokenFilePath(), JSON.stringify(payload, null, 2), 'utf-8')
}

async function clearPersistedToken(): Promise<void> {
  await rm(tokenFilePath(), { force: true })
}

function createSdkWithToken(token: string): Pan123SDK {
  return new Pan123SDK({ token, cacheConfig: { enabled: false } })
}

export async function initAuth(): Promise<void> {
  try {
    const raw = await readFile(tokenFilePath(), 'utf-8')
    const stored = JSON.parse(raw) as StoredToken
    if (!stored.token) return
    const token = decryptToken(stored)
    if (!token) {
      await clearPersistedToken()
      return
    }
    sdk = createSdkWithToken(token)
    account = stored.account
  } catch {
    sdk = null
    account = null
  }
}

export function getSdk(): Pan123SDK | null {
  return sdk
}

export function getAuthStatus(): AuthStatus {
  return { authenticated: !!sdk, account: account ?? undefined }
}

function toLoginError(error: unknown): Error {
  const message = error instanceof Error ? error.message : ''
  const axiosError = error as { response?: { status?: number }; code?: string }
  const status = axiosError?.response?.status
  if (status === 400 || status === 401 || status === 403 || /没有有效 token/.test(message)) {
    return new Error('账号或密码错误')
  }
  if (
    axiosError?.code === 'ECONNABORTED' ||
    axiosError?.code === 'ENOTFOUND' ||
    axiosError?.code === 'ERR_NETWORK'
  ) {
    return new Error('网络连接失败，请检查网络后重试')
  }
  return new Error('登录失败，请稍后重试')
}

async function login(credentials: LoginCredentials): Promise<AuthStatus> {
  const passport = credentials.passport.trim()
  if (!passport || !credentials.password) {
    throw new Error('请输入账号和密码')
  }
  const instance = new Pan123SDK({
    passport,
    password: credentials.password,
    cacheConfig: { enabled: false }
  })
  try {
    const tokenInfo = await instance.getTokenInfo()
    if (!tokenInfo) {
      throw new Error('登录失败，未获取到有效凭证')
    }
    await persistToken(passport, tokenInfo.accessToken)
    sdk = instance
    account = passport
    return { authenticated: true, account: passport }
  } catch (error) {
    throw toLoginError(error)
  }
}

async function logout(): Promise<void> {
  try {
    sdk?.clearAuth()
  } finally {
    sdk = null
    account = null
    await clearPersistedToken()
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', (_event, credentials: LoginCredentials) => login(credentials))
  ipcMain.handle('auth:status', () => getAuthStatus())
  ipcMain.handle('auth:logout', () => logout())
}
