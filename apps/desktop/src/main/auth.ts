import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, rm, writeFile } from 'fs/promises'
import { Pan123SDK } from '@123pan/api-sdk'
import type { AuthStatus, LoginCredentials, QrLoginState } from '@123pan/shared-types'

interface StoredAccount {
  account: string
  nickname?: string
  avatar?: string
  token: string
  encrypted: boolean
  savedAt: number
}

interface StoredAuthFile {
  version: 2
  activeAccount: string | null
  accounts: StoredAccount[]
}

/** 旧版单账户文件格式，读取时自动迁移 */
interface LegacyStoredToken {
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
let accounts = new Map<string, StoredAccount>()
let activeAccount: string | null = null

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

function decryptToken(stored: StoredAccount): string | null {
  if (!stored.encrypted) return stored.token
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored.token, 'base64'))
  } catch {
    return null
  }
}

/** 读取账户文件，并兼容迁移旧版单账户格式 */
async function readAuthFile(): Promise<{ file: StoredAuthFile; needsRewrite: boolean }> {
  try {
    const raw = await readFile(tokenFilePath(), 'utf-8')
    const parsed = JSON.parse(raw) as StoredAuthFile & LegacyStoredToken
    if (Array.isArray(parsed.accounts)) {
      return {
        file: {
          version: 2,
          activeAccount: parsed.activeAccount ?? null,
          accounts: parsed.accounts.filter((entry) => entry?.account && entry?.token)
        },
        needsRewrite: false
      }
    }
    if (parsed?.token && parsed?.account) {
      return {
        file: { version: 2, activeAccount: parsed.account, accounts: [parsed] },
        needsRewrite: true
      }
    }
  } catch {
    /* 文件不存在或损坏 */
  }
  return { file: { version: 2, activeAccount: null, accounts: [] }, needsRewrite: false }
}

async function persistAuthFile(): Promise<void> {
  if (accounts.size === 0) {
    await rm(tokenFilePath(), { force: true })
    return
  }
  const payload: StoredAuthFile = {
    version: 2,
    activeAccount,
    accounts: [...accounts.values()]
  }
  await writeFile(tokenFilePath(), JSON.stringify(payload, null, 2), 'utf-8')
}

/** 新增或更新一个账户（以 key 作为唯一标识），并保留既有资料 */
function upsertAccount(key: string, profile: AuthProfile, token: string): void {
  const existing = accounts.get(key)
  const nickname = profile.nickname ?? existing?.nickname
  const avatar = profile.avatar ?? existing?.avatar
  accounts.set(key, {
    account: key,
    ...(nickname ? { nickname } : {}),
    ...(avatar ? { avatar } : {}),
    ...encryptToken(token),
    savedAt: Date.now()
  })
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

/** 尝试用某个账户的 token 建立 SDK 并校验；失败时移除该账户 */
async function activateAccount(key: string): Promise<boolean> {
  const stored = accounts.get(key)
  if (!stored) return false
  const token = decryptToken(stored)
  if (!token) {
    accounts.delete(key)
    await persistAuthFile()
    return false
  }
  const instance = createSdkWithToken(token)
  try {
    const tokenInfo = await instance.getTokenInfo()
    if (!tokenInfo || tokenInfo.expiresAt <= Date.now()) {
      accounts.delete(key)
      await persistAuthFile()
      return false
    }
  } catch {
    return false
  }
  sdk = instance
  activeAccount = key
  return true
}

export async function initAuth(): Promise<void> {
  const { file, needsRewrite } = await readAuthFile()
  accounts = new Map(file.accounts.map((entry) => [entry.account, entry]))
  const preferred =
    file.activeAccount && accounts.has(file.activeAccount) ? file.activeAccount : null
  const order = preferred ? [preferred, ...accounts.keys()] : [...accounts.keys()]
  activeAccount = null
  sdk = null
  for (const key of order) {
    if (await activateAccount(key)) break
  }
  if (
    needsRewrite ||
    accounts.size !== file.accounts.length ||
    file.activeAccount !== activeAccount
  ) {
    await persistAuthFile()
  }
}

export function getSdk(): Pan123SDK | null {
  return sdk
}

export function getAuthStatus(): AuthStatus {
  const active = activeAccount ? accounts.get(activeAccount) : null
  return {
    authenticated: !!sdk && !!active,
    ...(active?.account && { account: active.account }),
    ...(active?.nickname && { nickname: active.nickname }),
    ...(active?.avatar && { avatar: active.avatar }),
    accounts: [...accounts.values()].map((entry) => ({
      account: entry.account,
      ...(entry.nickname && { nickname: entry.nickname }),
      ...(entry.avatar && { avatar: entry.avatar }),
      active: entry.account === activeAccount
    }))
  }
}

/** 登录/切换成功后设为当前账户并持久化 */
async function applyLogin(profile: AuthProfile, instance: Pan123SDK, token: string): Promise<void> {
  upsertAccount(profile.account, profile, token)
  sdk = instance
  activeAccount = profile.account
  await persistAuthFile()
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
    await applyLogin(profile, instance, tokenInfo.accessToken)
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
      await applyLogin(profile, instance, token)
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
      await applyLogin(profile, instance, result.token)
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

/** 切换当前账户；token 失效会移除该账户，网络错误则保留 */
async function switchAccount(key: string): Promise<AuthStatus> {
  if (key === activeAccount && sdk) return getAuthStatus()
  if (!accounts.has(key)) throw new Error('账户不存在')
  const stored = accounts.get(key)!
  const token = decryptToken(stored)
  if (!token) {
    accounts.delete(key)
    await persistAuthFile()
    throw new Error('该账户凭证已失效，请重新登录')
  }
  if (!(await activateAccount(key))) {
    if (!accounts.has(key)) throw new Error('该账户登录已过期，请重新登录')
    throw new Error('无法连接服务器，请检查网络后重试')
  }
  upsertAccount(key, await fetchProfile(sdk!, stored.account), token)
  await persistAuthFile()
  return getAuthStatus()
}

/** 退出当前账户；若还有其他账户则自动切换到其中一个 */
async function logout(): Promise<AuthStatus> {
  stopQrPolling()
  sdk?.clearAuth()
  if (activeAccount) accounts.delete(activeAccount)
  sdk = null
  activeAccount = null
  for (const key of accounts.keys()) {
    if (await activateAccount(key)) break
  }
  await persistAuthFile()
  return getAuthStatus()
}

/** 退出所有账户 */
async function logoutAll(): Promise<AuthStatus> {
  stopQrPolling()
  sdk?.clearAuth()
  sdk = null
  activeAccount = null
  accounts.clear()
  await persistAuthFile()
  return getAuthStatus()
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', (_event, credentials: LoginCredentials) =>
    loginWithPassword(credentials)
  )
  ipcMain.handle('auth:login-cookie', (_event, raw: string) => loginWithCookie(raw))
  ipcMain.handle('auth:qr-start', () => startQrLogin())
  ipcMain.handle('auth:qr-stop', () => stopQrPolling())
  ipcMain.handle('auth:status', () => getAuthStatus())
  ipcMain.handle('auth:switch', (_event, key: string) => switchAccount(key))
  ipcMain.handle('auth:logout', () => logout())
  ipcMain.handle('auth:logout-all', () => logoutAll())
}
