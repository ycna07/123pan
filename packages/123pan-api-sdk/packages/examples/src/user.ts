import { createClient } from './client'

/**
 * 查询用户信息与存储空间
 */
const sdk = createClient()
const user = await sdk.user.getUserInfo()
const info = user.data

console.log('用户信息:')
console.log('  UID:', info.uid)
console.log('  账号:', info.passport || '-')
console.log('  昵称:', info.nickname)
console.log('  VIP:', info.vip ? (info.vipLabel ?? '是') : '否')

const gb = (bytes: number): string => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
console.log('存储空间:')
console.log('  已用:', gb(info.spaceUsed))
console.log('  永久:', gb(info.spacePermanent))
console.log('  临时:', gb(info.spaceTemp))
