import { resolveToken } from './client'

/**
 * 解析 debugToken（JWT）：展示签名算法、用户信息（payload）与签名
 *
 * token 与登录示例共用 P123_TEST_TOKEN（环境变量或本目录 .env）。
 * 仅解码展示，签名校验需要 123pan 服务端密钥，本地无法完成。
 */

const token = resolveToken()
if (!token) {
  console.error('未找到 token：请设置 P123_TEST_TOKEN（或复制 .env.example 为 .env 填入）')
  process.exit(1)
}

const parts = token.split('.')
if (parts.length !== 3) {
  console.error(`不是标准的三段式 JWT（实际 ${parts.length} 段），无法解析`)
  process.exit(1)
}
const [headerPart, payloadPart, signaturePart] = parts

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

console.log('Debug Token 解析')
console.log('='.repeat(40))
console.log('')

const header = decodeSegment(headerPart)
if (header) {
  console.log('Header（签名算法）:')
  for (const [key, value] of Object.entries(header)) {
    console.log(`  ${key}: ${String(value)}`)
  }
} else {
  console.log('Header 解析失败：非 base64url JSON')
}
console.log('')

const payload = decodeSegment(payloadPart)
if (payload) {
  console.log('Payload（用户信息）:')
  for (const [key, value] of Object.entries(payload)) {
    const isTimestamp =
      (key === 'exp' || key === 'iat' || key === 'nbf') && typeof value === 'number'
    const text = isTimestamp
      ? `${value}（${new Date(value * 1000).toLocaleString()}）`
      : String(value)
    console.log(`  ${key}: ${text}`)
  }
  if (typeof payload.exp === 'number') {
    const remaining = payload.exp * 1000 - Date.now()
    console.log(
      remaining > 0
        ? `  状态: 有效，剩余 ${Math.floor(remaining / 3600000)} 小时`
        : '  状态: 已过期'
    )
  }
} else {
  console.log('Payload 解析失败：非 base64url JSON')
}
console.log('')

console.log('Signature（签名）:')
console.log(`  ${signaturePart}`)
console.log(`  长度: ${Buffer.from(signaturePart, 'base64url').length} 字节`)
console.log('')
console.log('注：仅解码展示，签名校验需要 123pan 服务端密钥，本地无法验证。')
