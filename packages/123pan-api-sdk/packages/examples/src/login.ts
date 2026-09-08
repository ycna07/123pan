import { Pan123SDK } from '../../sdk/src'

/**
 * 账号密码登录：sign_in 获取 JWT，读取过期时间后清理凭证
 */
const passport = process.env.P123_TEST_PASSPORT ?? ''
const password = process.env.P123_TEST_PASSWORD ?? ''
if (!passport || !password) {
  console.error('请先设置 P123_TEST_PASSPORT 和 P123_TEST_PASSWORD')
  process.exit(1)
}

const sdk = new Pan123SDK({
  passport,
  password,
  cacheConfig: { enabled: false },
  loggerConfig: { enableConsole: false }
})

const info = await sdk.getTokenInfo()
if (!info) {
  throw new Error('登录失败：未获取到 token')
}
console.log('登录成功')
console.log('token 类型:', info.tokenType)
console.log('过期时间:', new Date(info.expiresAt).toLocaleString())

sdk.clearAuth()
console.log('已清理本地凭证')
