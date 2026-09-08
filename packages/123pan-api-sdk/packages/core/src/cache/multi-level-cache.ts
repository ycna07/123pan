/**
 * 多级缓存管理器
 * 优先级: 文件 -> 内存
 */

import { TokenCacheAdapter, TokenInfo } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../logger'

export interface CacheConfig {
  cacheEnabled?: boolean
  cacheFilePath?: string
}

export class MultiLevelCacheManager implements TokenCacheAdapter {
  private cacheEnabled: boolean
  private cacheFilePath: string
  private memoryCache: TokenInfo | null = null
  private logger: Logger

  constructor(config: CacheConfig, logger?: Logger) {
    this.cacheEnabled = config.cacheEnabled !== false
    this.cacheFilePath = config.cacheFilePath || ''
    this.logger = logger || (console as any)
  }

  /**
   * 从多级缓存中获取token信息
   * 优先级: 文件 -> 内存
   */
  async getTokenInfo(): Promise<TokenInfo | null> {
    // 1. 尝试从文件缓存获取
    if (this.cacheEnabled && this.cacheFilePath) {
      try {
        const fileToken = await this.getTokenFromFile()
        if (fileToken) {
          this.logger?.info('Token retrieved from file cache')
          this.memoryCache = fileToken // 同步到内存缓存
          return fileToken
        }
      } catch (error) {
        this.logger?.warn('Failed to get token from file cache', error as Error)
      }
    }

    // 2. 最后从内存缓存获取
    if (this.memoryCache) {
      // 检查是否过期
      if (Date.now() >= this.memoryCache.expiresAt) {
        this.logger?.debug('Memory cache token expired')
        this.memoryCache = null
        return null
      }
      this.logger?.debug('Token retrieved from memory cache')
      return this.memoryCache
    }

    return null
  }

  /**
   * 保存token信息到多级缓存
   */
  async setTokenInfo(tokenInfo: TokenInfo): Promise<void> {
    this.logger?.debug('Saving token to multi-level cache')

    // 1. 保存到内存缓存
    this.memoryCache = tokenInfo

    // 2. 保存到文件缓存
    if (this.cacheEnabled && this.cacheFilePath) {
      try {
        await this.saveTokenToFile(tokenInfo)
      } catch (error) {
        this.logger?.warn('Failed to save token to file cache', error as Error)
      }
    }
  }

  /**
   * 清除多级缓存中的token信息
   */
  async clearTokenInfo(): Promise<void> {
    this.logger?.debug('Clearing token from multi-level cache')

    // 1. 清除内存缓存
    this.memoryCache = null

    // 2. 清除文件缓存
    if (this.cacheEnabled && this.cacheFilePath) {
      try {
        await this.deleteTokenFile()
      } catch (error) {
        this.logger?.warn('Failed to delete token file cache', error as Error)
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    // 至少有一个缓存可用就返回true
    const fileAvailable =
      this.cacheEnabled && this.cacheFilePath && fs.existsSync(this.cacheFilePath)
    const memoryAvailable = this.memoryCache !== null
    return fileAvailable || memoryAvailable
  }

  private async getTokenFromFile(): Promise<TokenInfo | null> {
    if (!this.cacheEnabled || !this.cacheFilePath || !fs.existsSync(this.cacheFilePath)) {
      return null
    }

    try {
      const cacheContent = fs.readFileSync(this.cacheFilePath, 'utf-8')
      const cachedToken: TokenInfo = JSON.parse(cacheContent)

      if (cachedToken.accessToken && cachedToken.expiresAt && Date.now() < cachedToken.expiresAt) {
        return cachedToken
      } else {
        // 文件缓存的token已过期，删除文件
        await this.deleteTokenFile()
        return null
      }
    } catch (error) {
      this.logger?.warn('Failed to read token from file', error as Error)
      await this.deleteTokenFile()
      return null
    }
  }

  private async saveTokenToFile(tokenInfo: TokenInfo): Promise<void> {
    if (!this.cacheEnabled || !this.cacheFilePath) {
      return
    }

    // 确保目录存在
    const cacheDir = path.dirname(this.cacheFilePath)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    fs.writeFileSync(this.cacheFilePath, JSON.stringify(tokenInfo, null, 2), 'utf-8')
    this.logger?.debug('Token saved to file cache', {
      path: this.cacheFilePath,
      expiresAt: new Date(tokenInfo.expiresAt).toISOString()
    })
  }

  private async deleteTokenFile(): Promise<void> {
    if (!this.cacheEnabled || !this.cacheFilePath || !fs.existsSync(this.cacheFilePath)) {
      return
    }

    try {
      fs.unlinkSync(this.cacheFilePath)
      this.logger?.debug('Token file cache deleted')
    } catch (error) {
      this.logger?.warn('Failed to delete token file cache', error as Error)
    }
  }
}
