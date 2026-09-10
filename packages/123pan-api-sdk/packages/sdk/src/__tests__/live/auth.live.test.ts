import { describe, expect, it } from 'vitest'
import Pan123SDK from '../../index'

/**
 * 真实接口冒烟测试，默认跳过，避免 CI/离线环境失败：
 *
 * - 二维码流程（无凭据即可）：P123_LIVE_TEST=1 pnpm --filter @123pan/api-sdk test:live
 * - 账号密码流程：额外提供 P123_TEST_PASSPORT / P123_TEST_PASSWORD 环境变量
 */
const qrLive = process.env.P123_LIVE_TEST === '1'
const passport = process.env.P123_TEST_PASSPORT ?? ''
const password = process.env.P123_TEST_PASSWORD ?? ''

function createSdk(): Pan123SDK {
  return new Pan123SDK({
    cacheConfig: { enabled: false },
    loggerConfig: { enableConsole: false }
  })
}

describe.skipIf(!qrLive)('二维码登录 · 真实接口', () => {
  it('生成二维码并轮询到合法状态', async () => {
    const sdk = createSdk()

    const session = await sdk.createQrLogin()
    expect(session.uniID).toBeTruthy()
    expect(session.qrUrl).toContain('uniID=')
    expect(session.qrUrl).toContain(session.uniID)

    const result = await sdk.pollQrLogin(session.uniID)
    expect(['waiting', 'scanned', 'logging', 'cancelled', 'expired', 'success']).toContain(
      result.status
    )
  }, 30000)
})

describe.skipIf(!passport || !password)('账号密码登录 · 真实接口', () => {
  it('sign_in 获取 token 并查询用户信息', async () => {
    const sdk = new Pan123SDK({
      passport,
      password,
      cacheConfig: { enabled: false },
      loggerConfig: { enableConsole: false }
    })

    const info = await sdk.getTokenInfo()
    expect(info?.accessToken).toBeTruthy()

    const user = await sdk.user.getUserInfo()
    expect(user.data.uid).toBeGreaterThan(0)

    sdk.clearAuth()
  }, 30000)
})
