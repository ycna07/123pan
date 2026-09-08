import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Pan123SDK } from '../../sdk/src'

/**
 * 共享客户端工厂：凭证从环境变量或本目录 .env 读取（环境变量优先）
 *
 * - P123_TEST_TOKEN：直接使用网页端 JWT（优先）
 * - P123_TEST_PASSPORT + P123_TEST_PASSWORD：账号密码登录
 */
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url))

/** 极简 .env 解析：KEY=VALUE，支持 # 注释、成对引号与跨行引号值 */
export function loadDotEnv(path: string): Record<string, string> {
  const vars: Record<string, string> = {}
  let content: string
  try {
    content = readFileSync(path, 'utf-8')
  } catch {
    return vars
  }
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    const quote = value[0]
    if (quote === '"' || quote === "'") {
      // 引号值支持跨行书写（dotenv 语义）；token 类取值拼接时不保留换行
      while (!(value.length >= 2 && value.endsWith(quote)) && i + 1 < lines.length) {
        i += 1
        value += lines[i].trimEnd()
      }
      if (value.length >= 2 && value.endsWith(quote)) {
        value = value.slice(1, -1)
      }
    }
    vars[key] = value
  }
  return vars
}

function credential(name: string): string {
  return process.env[name] ?? loadDotEnv(ENV_FILE)[name] ?? ''
}

/** 统一的 token 解析：环境变量优先，其次本目录 .env */
export function resolveToken(): string {
  return credential('P123_TEST_TOKEN')
}

export function createClient(): Pan123SDK {
  const token = resolveToken()
  const passport = credential('P123_TEST_PASSPORT')
  const password = credential('P123_TEST_PASSWORD')

  if (token) {
    return new Pan123SDK({
      token,
      cacheConfig: { enabled: false },
      loggerConfig: { enableConsole: false },
    })
  }
  if (passport && password) {
    return new Pan123SDK({
      passport,
      password,
      cacheConfig: { enabled: false },
      loggerConfig: { enableConsole: false },
    })
  }

  console.error(
    '缺少测试凭证：请设置 P123_TEST_PASSPORT + P123_TEST_PASSWORD（或 P123_TEST_TOKEN，可在 .env 中配置）',
  )
  process.exit(1)
}

/** 从 JWT exp 计算剩余有效期（毫秒），解析失败返回 null */
export function tokenTtlMs(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as { exp?: number }
    return typeof claims.exp === 'number' ? claims.exp * 1000 - Date.now() : null
  } catch {
    return null
  }
}
