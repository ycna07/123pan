/**
 * 缓存接口定义
 */

export interface TokenCacheAdapter {
  /**
   * 获取缓存的token信息
   * @returns TokenInfo如果存在且有效，否则返回null
   */
  getTokenInfo(): Promise<TokenInfo | null>

  /**
   * 保存token信息到缓存
   * @param tokenInfo Token信息
   */
  setTokenInfo(tokenInfo: TokenInfo): Promise<void>

  /**
   * 清除缓存的token信息
   */
  clearTokenInfo(): Promise<void>

  /**
   * 检查缓存是否可用
   */
  isAvailable(): Promise<boolean>
}

export interface TokenInfo {
  accessToken: string
  expiresAt: number
  tokenType: string
}
