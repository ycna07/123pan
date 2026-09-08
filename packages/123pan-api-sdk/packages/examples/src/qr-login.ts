import { createClient } from './client'

/**
 * 扫码登录全流程：生成二维码 → 轮询状态 → 成功后查询用户信息
 *
 * 终端无法直接展示二维码图片，请复制 qrUrl 到任意二维码生成工具后用 123云盘 App 扫码。
 */
const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 120_000

const sdk = createClient()
const session = await sdk.createQrLogin()

console.log('请扫码登录，二维码内容：')
console.log(session.qrUrl)

const deadline = Date.now() + TIMEOUT_MS
let loggedIn = false
while (Date.now() < deadline && !loggedIn) {
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  const result = await sdk.pollQrLogin(session.uniID)

  switch (result.status) {
    case 'waiting':
      console.log('等待扫码…')
      break
    case 'scanned':
      console.log('已扫码，请在手机上确认')
      break
    case 'logging':
      console.log('已确认，正在登录…')
      break
    case 'success':
      console.log('登录成功')
      console.log('token 前 16 位:', result.token.slice(0, 16))
      loggedIn = true
      break
    case 'cancelled':
      console.error('登录已取消')
      process.exit(1)
    case 'expired':
      console.error('二维码已过期，请重新运行')
      process.exit(1)
  }
}

if (!loggedIn) {
  console.error('等待超时，请重新运行')
  process.exit(1)
}

const info = await sdk.getTokenInfo()
if (info) {
  const user = await sdk.user.getUserInfo()
  console.log('当前用户:', user.data.nickname || user.data.passport)
}
