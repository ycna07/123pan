import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, rm, writeFile } from 'fs/promises'
import { Pan123SDK } from '@123pan/api-sdk'
import type { AuthStatus, LoginCredentials, QrLoginState } from '@123pan/shared-types'

interface StoredToken {
  account: string
  nickname?: string
  avatar?: string
  token: string
  encrypted: boolean
  savedAt: number
}

interface AuthProfile {
  account: string
  nickname?: string
  avatar?: string
}

let sdk: Pan123SDK | null = null
let account: string | null = null
let nickname: string | null = null
let avatar: string | null = null

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

const QR_POLL_INTERVAL_MS = 2000

let qrSessionSdk: Pan123SDK | null = null
let qrSessionUniId: string | null = null
let qrPollTimer: NodeJS.Timeout | null = null

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

async function persistToken(profile: AuthProfile, token: string): Promise<void> {
  const payload: StoredToken = {
    account: profile.account,
    ...(profile.nickname && { nickname: profile.nickname }),
    ...(profile.avatar && { avatar: profile.avatar }),
    ...encryptToken(token),
    savedAt: Date.now()
  }
  await writeFile(tokenFilePath(), JSON.stringify(payload, null, 2), 'utf-8')
}

async function clearPersistedToken(): Promise<void> {
  await rm(tokenFilePath(), { force: true })
}

function createSdkWithToken(token: string): Pan123SDK {
  return new Pan123SDK({
    token,
    cacheConfig: { enabled: false },
    loggerConfig: { enableConsole: false }
  })
}

function decodeJwtExpirationMs(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8')) as { exp?: number }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

function extractTokenCandidates(raw: string): string[] {
  const found = new Map<string, number | null>()
  for (const match of raw.match(JWT_PATTERN) ?? []) {
    if (!found.has(match)) found.set(match, decodeJwtExpirationMs(match))
  }
  return [...found.entries()]
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 5)
    .map(([token]) => token)
}

async function validateToken(token: string): Promise<AuthProfile | null> {
  const instance = createSdkWithToken(token)
  try {
    const response = await instance.user.getUserInfo()
    const info = response.data
    if (!info?.uid) return null
    return {
      account: info.passport || info.nickname || `uid:${info.uid}`,
      ...(info.nickname && { nickname: info.nickname }),
      ...(info.headImage && { avatar: info.headImage })
    }
  } catch {
    return null
  }
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
    const instance = createSdkWithToken(token)
    const tokenInfo = await instance.getTokenInfo()
    if (!tokenInfo || tokenInfo.expiresAt <= Date.now()) {
      await clearPersistedToken()
      return
    }
    sdk = instance
    account = stored.account
    nickname = stored.nickname ?? null
    avatar = stored.avatar ?? null
  } catch {
    sdk = null
    account = null
    nickname = null
    avatar = null
  }
}

export function getSdk(): Pan123SDK | null {
  return sdk
}

export function getAuthStatus(): AuthStatus {
  return {
    authenticated: !!sdk,
    ...(account && { account }),
    ...(nickname && { nickname }),
    ...(avatar && { avatar })
  }
}

function applyLogin(profile: AuthProfile, instance: Pan123SDK): void {
  sdk = instance
  account = profile.account
  nickname = profile.nickname ?? null
  avatar = profile.avatar ?? null
}

function broadcastLoginSuccess(): void {
  const status = getAuthStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:login-success', status)
  }
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

async function fetchProfile(instance: Pan123SDK, fallbackAccount: string): Promise<AuthProfile> {
  try {
    const response = await instance.user.getUserInfo()
    const info = response.data
    if (info?.uid) {
      return {
        account: info.passport || info.nickname || fallbackAccount,
        ...(info.nickname && { nickname: info.nickname }),
        ...(info.headImage && { avatar: info.headImage })
      }
    }
  } catch {
    /* profile is optional; keep fallback */
  }
  return { account: fallbackAccount }
}

async function loginWithPassword(credentials: LoginCredentials): Promise<AuthStatus> {
  const passport = credentials.passport.trim()
  if (!passport || !credentials.password) {
    throw new Error('请输入账号和密码')
  }
  const instance = new Pan123SDK({
    passport,
    password: credentials.password,
    cacheConfig: { enabled: false },
    loggerConfig: { enableConsole: false }
  })
  try {
    const tokenInfo = await instance.getTokenInfo()
    if (!tokenInfo) {
      throw new Error('登录失败，未获取到有效凭证')
    }
    const profile = await fetchProfile(instance, passport)
    await persistToken(profile, tokenInfo.accessToken)
    applyLogin(profile, instance)
    broadcastLoginSuccess()
    return getAuthStatus()
  } catch (error) {
    throw toLoginError(error)
  }
}

async function loginWithCookie(raw: string): Promise<AuthStatus> {
  if (!raw.trim()) {
    throw new Error('请先粘贴 Cookie 或 token 内容')
  }
  const candidates = extractTokenCandidates(raw)
  if (!candidates.length) {
    throw new Error('未在粘贴内容中找到登录凭证，请确认复制了完整的 Cookie 或 token')
  }
  for (const token of candidates) {
    const profile = await validateToken(token)
    if (profile) {
      const instance = createSdkWithToken(token)
      await persistToken(profile, token)
      applyLogin(profile, instance)
      broadcastLoginSuccess()
      return getAuthStatus()
    }
  }
  throw new Error('Cookie 校验失败：凭证无效或已过期，请重新复制')
}

function stopQrPolling(): void {
  if (qrPollTimer) {
    clearInterval(qrPollTimer)
    qrPollTimer = null
  }
  qrSessionSdk = null
  qrSessionUniId = null
}

function sendQrStatus(state: QrLoginState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:qr-status', state)
  }
}

async function pollQrLogin(): Promise<void> {
  const instance = qrSessionSdk
  const uniId = qrSessionUniId
  if (!instance || !uniId) return
  let result: Awaited<ReturnType<Pan123SDK['pollQrLogin']>>
  try {
    result = await instance.pollQrLogin(uniId)
  } catch {
    return /* transient error; retry on next tick */
  }
  switch (result.status) {
    case 'waiting':
    case 'scanned':
    case 'logging':
      sendQrStatus({ status: result.status })
      break
    case 'success': {
      stopQrPolling()
      const profile = await fetchProfile(instance, '扫码登录')
      await persistToken(profile, result.token)
      applyLogin(profile, instance)
      broadcastLoginSuccess()
      break
    }
    case 'cancelled':
    case 'expired': {
      stopQrPolling()
      sendQrStatus({ status: result.status, ...(result.message && { message: result.message }) })
      break
    }
  }
}

async function startQrLogin(): Promise<{ qrUrl: string }> {
  stopQrPolling()
  const instance = new Pan123SDK({
    cacheConfig: { enabled: false },
    loggerConfig: { enableConsole: false }
  })
  const session = await instance.createQrLogin()
  qrSessionSdk = instance
  qrSessionUniId = session.uniID
  qrPollTimer = setInterval(() => {
    void pollQrLogin()
  }, QR_POLL_INTERVAL_MS)
  return { qrUrl: session.qrUrl }
}

async function logout(): Promise<void> {
  stopQrPolling()
  try {
    sdk?.clearAuth()
  } finally {
    sdk = null
    account = null
    nickname = null
    avatar = null
    await clearPersistedToken()
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', (_event, credentials: LoginCredentials) =>
    loginWithPassword(credentials)
  )
  ipcMain.handle('auth:login-cookie', (_event, raw: string) => loginWithCookie(raw))
  ipcMain.handle('auth:qr-start', () => startQrLogin())
  ipcMain.handle('auth:qr-stop', () => stopQrPolling())
  ipcMain.handle('auth:status', () => getAuthStatus())
  ipcMain.handle('auth:logout', () => logout())
}
