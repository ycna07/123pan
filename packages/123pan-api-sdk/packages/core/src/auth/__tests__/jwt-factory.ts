/**
 * 测试用 JWT 构造工具
 *
 * 123pan 的登录凭证是 JWT，SDK 通过解析 payload 中的 exp 字段（秒）确定过期时间。
 */

export function makeJwt(claims: Record<string, unknown>): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.signature`;
}

/** 一小时后过期的 exp（秒） */
export function futureExp(offsetSeconds = 3600): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

/** 一小时前过期的 exp（秒） */
export function pastExp(offsetSeconds = 3600): number {
  return Math.floor(Date.now() / 1000) - offsetSeconds;
}
