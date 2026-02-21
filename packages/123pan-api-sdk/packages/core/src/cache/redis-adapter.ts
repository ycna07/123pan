/**
 * Redis缓存适配器
 */

import { TokenCacheAdapter, TokenInfo } from "./types";
import { Logger } from "../logger";

export class RedisCacheAdapter implements TokenCacheAdapter {
  private redisClient: any;
  private keyPrefix: string;
  private logger: Logger;
  private available: boolean = false;

  constructor(
    redisClient: any,
    keyPrefix: string = "123pan:token:",
    logger?: Logger,
  ) {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
    this.logger = logger || (console as any);
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      await this.redisClient.ping();
      this.available = true;
      this.logger?.info("Redis cache adapter initialized successfully");
    } catch (error) {
      this.available = false;
      this.logger?.warn(
        "Redis cache adapter initialization failed, Redis will not be used",
        error as Error,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  private getCacheKey(): string {
    return `${this.keyPrefix}token`;
  }

  async getTokenInfo(): Promise<TokenInfo | null> {
    if (!this.available) {
      return null;
    }

    try {
      const data = await this.redisClient.get(this.getCacheKey());
      if (!data) {
        return null;
      }

      const tokenInfo: TokenInfo = JSON.parse(data);

      // 检查token是否过期
      if (Date.now() >= tokenInfo.expiresAt) {
        // 如果过期，删除缓存
        await this.clearTokenInfo();
        return null;
      }

      this.logger?.debug("Token info retrieved from Redis cache", {
        expiresAt: new Date(tokenInfo.expiresAt).toISOString(),
      });
      return tokenInfo;
    } catch (error) {
      this.logger?.error("Failed to get token info from Redis", error as Error);
      return null;
    }
  }

  async setTokenInfo(tokenInfo: TokenInfo): Promise<void> {
    if (!this.available) {
      return;
    }

    try {
      const data = JSON.stringify(tokenInfo);
      // 设置过期时间为token过期时间+60秒缓冲
      const ttl = Math.max(tokenInfo.expiresAt - Date.now() + 60000, 60000);

      await this.redisClient.set(this.getCacheKey(), data, "PX", ttl);

      this.logger?.debug("Token info saved to Redis cache", {
        expiresAt: new Date(tokenInfo.expiresAt).toISOString(),
        ttl: ttl / 1000,
      });
    } catch (error) {
      this.logger?.error("Failed to save token info to Redis", error as Error);
    }
  }

  async clearTokenInfo(): Promise<void> {
    if (!this.available) {
      return;
    }

    try {
      await this.redisClient.del(this.getCacheKey());
      this.logger?.debug("Token info cleared from Redis cache");
    } catch (error) {
      this.logger?.error(
        "Failed to clear token info from Redis",
        error as Error,
      );
    }
  }
}
