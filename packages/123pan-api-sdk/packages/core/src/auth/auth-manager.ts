/**
 * 认证管理器 - 负责获取和管理access token
 */

import axios, { AxiosInstance } from "axios";
import { Logger, createModuleLogger, LogLevel } from "../logger";
import { MultiLevelCacheManager } from "../cache/multi-level-cache";
import type {
  SdkConfig,
  AccessTokenResponse,
  TokenInfo,
  ApiError,
} from "../types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class AuthManager {
  private clientID: string;
  private clientSecret: string;
  private baseURL: string;
  private timeout: number;
  private tokenInfo: TokenInfo | null = null;
  private httpClient: AxiosInstance;
  private tokenRefreshPromise: Promise<TokenInfo> | null = null;
  private lastRefreshTime: number = 0;
  private readonly minRefreshInterval: number = 30 * 1000; // 最小刷新间隔30秒
  private logger: Logger;
  private config: SdkConfig;
  private cacheEnabled: boolean;
  private cacheFilePath: string;
  private cacheManager?: MultiLevelCacheManager;
  private cacheManagerInitPromise: Promise<void> | undefined;

  constructor(config: SdkConfig) {
    this.config = config;
    this.clientID = config.clientID;
    this.clientSecret = config.clientSecret;
    this.baseURL = config.baseURL || "https://open-api.123pan.com";
    this.timeout = config.timeout || 30000;

    // 初始化日志器（移到前面，因为后续可能需要使用）
    const loggerConfig = config.loggerConfig || {};
    const logLevel = loggerConfig.level
      ? LogLevel[loggerConfig.level]
      : config.debug
        ? LogLevel.DEBUG
        : LogLevel.INFO;

    this.logger = createModuleLogger("AuthManager", {
      level: logLevel,
      enableConsole: loggerConfig.enableConsole !== false,
      enableRemote: loggerConfig.enableRemote || false,
      ...(loggerConfig.remoteEndpoint && {
        remoteEndpoint: loggerConfig.remoteEndpoint,
      }),
      colors: loggerConfig.colors !== false,
      maxEntries: loggerConfig.maxEntries || 1000,
    });

    // 初始化缓存配置
    this.cacheEnabled = config.cacheConfig?.enabled !== false;
    const cacheDir =
      config.cacheConfig?.cacheDir || path.join(os.homedir(), ".123pan-sdk");
    const cacheFileName = config.cacheConfig?.fileName || "token-cache.json";
    this.cacheFilePath = path.join(cacheDir, cacheFileName);

    // 确保缓存目录存在
    if (this.cacheEnabled && !fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (error) {
        this.logger.warn(
          "Failed to create cache directory, caching disabled",
          error as Error,
        );
        this.cacheEnabled = false;
      }
    }

    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        "User-Agent": "123pan-api-sdk",
        "Content-Type": "application/json",
        platform: "open_platform", // 添加平台字段
      },
    });

    this.setupInterceptors();

    // 尝试从缓存加载token
    if (this.cacheEnabled) {
      this.loadTokenFromCache();
    }

    // 如果在debug模式下提供了预设token，直接使用
    if (config.debug && config.debugToken) {
      this.setDebugToken(config.debugToken);
      this.logger.info("Using debug token instead of API authentication");
    } else if (!this.tokenInfo || !this.isTokenValid()) {
      /** 只有当缓存token无效或不存在时，才刷新token */
      this.forceRefreshToken();
    } else {
      this.logger.info("Using cached access token");
    }

    // 异步初始化多级缓存管理器
    this.cacheManagerInitPromise = this.initializeCacheManager();
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.data) {
          const apiError: ApiError = {
            code: error.response.data.code || error.response.status,
            message: error.response.data.message || error.message,
            details: error.response.data,
          };
          throw apiError;
        }
        throw error;
      },
    );
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken(): Promise<string> {
    // 等待缓存管理器初始化完成
    if (this.cacheManagerInitPromise) {
      await this.cacheManagerInitPromise;
      this.cacheManagerInitPromise = undefined;
    }

    // 如果使用debug token且有效，直接返回
    if (this.isUsingDebugToken() && this.tokenInfo && this.isTokenValid()) {
      this.logger.debug("Using debug token");
      return this.tokenInfo.accessToken;
    }

    // 如果token存在且未过期，直接返回
    if (this.tokenInfo && this.isTokenValid()) {
      this.logger.debug("Using existing valid access token");
      return this.tokenInfo.accessToken;
    }

    // 如果使用debug token但已过期，警告用户
    if (this.isUsingDebugToken()) {
      this.logger.warn(
        "Debug token has expired, please update debugToken in config",
      );
      throw new Error("Debug token has expired");
    }

    // 如果正在刷新token，等待刷新完成
    if (this.tokenRefreshPromise) {
      this.logger.debug("Token refresh in progress, waiting for completion");
      const tokenInfo = await this.tokenRefreshPromise;
      return tokenInfo.accessToken;
    }

    // 刷新token
    this.logger.info("Refreshing access token");
    this.tokenRefreshPromise = this.refreshToken();

    try {
      const tokenInfo = await this.tokenRefreshPromise;
      this.logger.info("Access token refreshed successfully");
      return tokenInfo.accessToken;
    } catch (error) {
      this.logger.error("Failed to refresh access token", error as Error);
      throw error;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * 刷新访问令牌
   */
  private async refreshToken(): Promise<TokenInfo> {
    try {
      this.logger.debug("Requesting new access token from API");
      const response = await this.httpClient.post<AccessTokenResponse>(
        "/api/v1/access_token",
        {
          clientID: this.clientID,
          clientSecret: this.clientSecret,
        },
      );

      this.logger.debug("Token API response received", {
        status: response.status,
        data: response.data,
      });

      // 检查API响应格式
      if (!response.data) {
        throw new Error("Invalid API response: missing data field");
      }

      let tokenData;
      const responseData = response.data;

      // 只支持包装格式：{code, message, data, x-traceID}
      if (typeof responseData.code === "undefined") {
        throw new Error(
          "Invalid token response: missing code field (expected wrapped format)",
        );
      }

      this.logger.debug("Processing wrapped API response format");

      if (responseData.code !== 0) {
        const errorMessage = responseData.message || "Unknown API error";
        const traceId = responseData["x-traceID"] || "unknown";

        this.logger.error("Token API returned error", new Error(errorMessage), {
          code: responseData.code,
          message: errorMessage,
          traceId: traceId,
          data: responseData.data,
        });

        throw new Error(
          `Token API error (code: ${responseData.code}): ${errorMessage} [TraceID: ${traceId}]`,
        );
      }

      // 验证成功响应的数据结构
      if (!responseData.data || !responseData.data.accessToken) {
        throw new Error(
          "Invalid token response: missing accessToken in data field",
        );
      }

      tokenData = responseData.data;

      // 使用驼峰格式字段名
      const { accessToken, expiresIn, tokenType } = tokenData;

      // 验证expiresIn是否为有效数字
      const expiresInMs =
        typeof expiresIn === "number" && expiresIn > 0
          ? expiresIn * 1000
          : 3600 * 1000; // 默认1小时

      this.tokenInfo = {
        accessToken: accessToken,
        expiresAt: Date.now() + expiresInMs - 60000, // 提前1分钟过期
        tokenType: tokenType,
      };

      // 更新最后刷新时间
      this.lastRefreshTime = Date.now();

      // 保存到多级缓存
      if (this.cacheManager) {
        await this.cacheManager.setTokenInfo(this.tokenInfo);
      }

      this.saveTokenToCache();

      this.logger.debug("Access token received and stored", {
        tokenType: tokenType,
        expiresIn: expiresIn,
        expiresInSeconds: expiresInMs / 1000,
        expiresAt: new Date(this.tokenInfo.expiresAt).toISOString(),
      });

      return this.tokenInfo;
    } catch (error) {
      this.logger.error("Token refresh API call failed", error as Error);
      this.tokenInfo = null;
      throw error;
    }
  }

  /**
   * 检查token是否有效
   */
  private isTokenValid(): boolean {
    if (!this.tokenInfo) {
      return false;
    }
    return Date.now() < this.tokenInfo.expiresAt;
  }

  /**
   * 异步初始化多级缓存管理器
   */
  private async initializeCacheManager(): Promise<void> {
    try {
      // 动态导入RedisCacheAdapter以避免Redis包的编译时依赖
      const { RedisCacheAdapter } = await import("../cache/redis-adapter");
      let redisAdapter: any = undefined;

      if (this.config.cacheConfig?.redis?.enabled) {
        try {
          if (this.config.cacheConfig.redis.client) {
            // 使用提供的Redis客户端实例
            redisAdapter = new RedisCacheAdapter(
              this.config.cacheConfig.redis.client,
              this.config.cacheConfig.redis.keyPrefix || "123pan:token:",
              this.logger,
            );
          } else if (this.config.cacheConfig.redis.url) {
            // 从URL创建Redis客户端
            const { createClient } = await import("redis");
            const redisClient = createClient({
              url: this.config.cacheConfig.redis.url,
            });
            await redisClient.connect();
            redisAdapter = new RedisCacheAdapter(
              redisClient,
              this.config.cacheConfig.redis.keyPrefix || "123pan:token:",
              this.logger,
            );
          } else if (
            this.config.cacheConfig.redis.host &&
            this.config.cacheConfig.redis.port
          ) {
            // 从host和port创建Redis客户端
            const { createClient } = await import("redis");
            const redisClient = createClient({
              socket: {
                host: this.config.cacheConfig.redis.host,
                port: this.config.cacheConfig.redis.port,
              },
              password: this.config.cacheConfig.redis.password,
              database: this.config.cacheConfig.redis.db || 0,
            });
            await redisClient.connect();
            redisAdapter = new RedisCacheAdapter(
              redisClient,
              this.config.cacheConfig.redis.keyPrefix || "123pan:token:",
              this.logger,
            );
          }
        } catch (error) {
          this.logger.warn(
            "Failed to initialize Redis cache adapter",
            error as Error,
          );
        }
      }

      this.cacheManager = new MultiLevelCacheManager(
        {
          redisAdapter,
          cacheEnabled: this.cacheEnabled,
          cacheFilePath: this.cacheFilePath,
        },
        this.logger,
      );

      // 尝试从多级缓存加载token
      const cachedToken = await this.cacheManager.getTokenInfo();
      if (cachedToken) {
        this.tokenInfo = cachedToken;
        this.logger.info("Token loaded from multi-level cache");
      }
    } catch (error) {
      this.logger.warn(
        "Failed to initialize multi-level cache manager",
        error as Error,
      );
    }
  }

  /**
   * 清除token信息
   */
  async clearToken(): Promise<void> {
    this.logger.info("Clearing stored access token");
    this.tokenInfo = null;
    this.tokenRefreshPromise = null;

    // 清除多级缓存
    if (this.cacheManager) {
      await this.cacheManager.clearTokenInfo();
    }

    this.deleteCacheFile();
  }

  /**
   * 获取logger实例
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 获取当前token信息
   */
  getTokenInfo(): TokenInfo | null {
    return this.tokenInfo;
  }

  /**
   * 获取最后刷新时间
   */
  getLastRefreshTime(): number {
    return this.lastRefreshTime;
  }

  /**
   * 获取最小刷新间隔
   */
  getMinRefreshInterval(): number {
    return this.minRefreshInterval;
  }

  /**
   * 检查认证配置是否有效
   */
  isConfigValid(): boolean {
    return !!(this.clientID && this.clientSecret);
  }

  /**
   * 强制刷新token
   */
  async forceRefreshToken(): Promise<string> {
    this.tokenInfo = null;
    this.tokenRefreshPromise = null;
    return this.getAccessToken();
  }

  /**
   * 强制刷新token（带重试机制）
   */
  async forceRefreshTokenWithRetry(maxRetries: number = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        this.logger.info(
          `Attempting token refresh (attempt ${i + 1}/${maxRetries})`,
        );
        await this.forceRefreshToken();
        const token = await this.getAccessToken();
        this.logger.info("Token refresh successful");
        return token;
      } catch (error) {
        lastError = error as Error;
        this.logger.error(`Token refresh attempt ${i + 1} failed`, lastError);

        if (i < maxRetries - 1) {
          // 等待一段时间再重试，避免过于频繁
          const delay = Math.min(1000 * Math.pow(2, i), 5000); // 指数退避，最大5秒
          this.logger.info(`Waiting ${delay}ms before retry`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`All ${maxRetries} token refresh attempts failed`);
    throw lastError || new Error("Token refresh failed");
  }

  /**
   * 设置调试token（仅在debug模式下使用）
   */
  private setDebugToken(debugToken: string): void {
    if (!this.config.debug) {
      this.logger.warn("Debug token can only be used in debug mode");
      return;
    }

    // 解析JWT token获取过期时间
    let expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 默认24小时后过期

    try {
      // 简单解析JWT token的payload部分
      const parts = debugToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp) {
          expiresAt = payload.exp * 1000; // JWT的exp是秒，转换为毫秒
        }
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse debug token expiration, using default 24h",
        error as Error,
      );
    }

    this.tokenInfo = {
      accessToken: debugToken,
      expiresAt: expiresAt,
      tokenType: "Bearer",
    };

    this.logger.debug("Debug token set successfully", {
      tokenType: "Bearer",
      expiresAt: new Date(expiresAt).toISOString(),
      tokenLength: debugToken.length,
    });
  }

  /**
   * 检查是否使用debug token
   */
  private isUsingDebugToken(): boolean {
    return !!(this.config.debug && this.config.debugToken && this.tokenInfo);
  }

  /**
   * 从缓存文件加载token
   */
  private loadTokenFromCache(): void {
    if (!this.cacheEnabled || !fs.existsSync(this.cacheFilePath)) {
      return;
    }

    try {
      const cacheContent = fs.readFileSync(this.cacheFilePath, "utf-8");
      const cachedToken: TokenInfo = JSON.parse(cacheContent);

      if (
        cachedToken.accessToken &&
        cachedToken.expiresAt &&
        Date.now() < cachedToken.expiresAt
      ) {
        this.tokenInfo = cachedToken;
        this.logger.info("Loaded valid access token from cache", {
          expiresAt: new Date(cachedToken.expiresAt).toISOString(),
        });
      } else {
        this.logger.debug("Cached token is expired, will fetch new one");
        this.deleteCacheFile();
      }
    } catch (error) {
      this.logger.warn(
        "Failed to load token from cache, will fetch new one",
        error as Error,
      );
      this.deleteCacheFile();
    }
  }

  /**
   * 保存token到缓存文件
   */
  private saveTokenToCache(): void {
    if (!this.cacheEnabled || !this.tokenInfo) {
      return;
    }

    try {
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(this.tokenInfo, null, 2),
        "utf-8",
      );
      this.logger.debug("Token saved to cache", {
        path: this.cacheFilePath,
        expiresAt: new Date(this.tokenInfo.expiresAt).toISOString(),
      });
    } catch (error) {
      this.logger.warn("Failed to save token to cache", error as Error);
    }
  }

  /**
   * 删除缓存文件
   */
  private deleteCacheFile(): void {
    if (!this.cacheEnabled || !fs.existsSync(this.cacheFilePath)) {
      return;
    }

    try {
      fs.unlinkSync(this.cacheFilePath);
      this.logger.debug("Cache file deleted", { path: this.cacheFilePath });
    } catch (error) {
      this.logger.warn("Failed to delete cache file", error as Error);
    }
  }
}
