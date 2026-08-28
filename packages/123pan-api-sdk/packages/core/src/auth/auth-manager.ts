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
  private passport: string;
  private password: string;
  private baseURL: string;
  private loginBaseURL: string;
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
    this.passport = config.passport || "";
    this.password = config.password || "";
    this.clientID = config.clientID || "";
    this.clientSecret = config.clientSecret || "";
    this.baseURL = config.baseURL || "https://www.123pan.com/b";
    this.loginBaseURL = config.loginBaseURL || "https://login.123pan.com/api";
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
        platform: "web",
        "app-version": "3",
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
      if (config.token) {
        this.setDirectToken(config.token);
      } else if (this.canUseNormalAuth()) {
        /** 账号密码模式：首次请求前按需登录，不阻塞构造函数 */
        void this.forceRefreshToken().catch((error) => {
          this.logger.warn("Background login failed", error as Error);
        });
      } else if (this.canUseOpenAuth() && this.baseURL.includes("open-api.123pan.com")) {
        /** 兼容模式：显式使用 Open API baseURL 时保留旧凭证登录 */
        void this.forceRefreshToken().catch((error) => {
          this.logger.warn("Background login failed", error as Error);
        });
      }
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
      let token = "";
      let responseStatus = 0;
      let responseBody: unknown;
      if (this.canUseNormalAuth()) {
        this.logger.debug("Signing in with passport");
        const response = await axios.post<AccessTokenResponse>(
          `${this.loginBaseURL}/user/sign_in`,
          {
            passport: this.passport,
            password: this.password,
            remember: true,
          },
          {
            timeout: this.timeout,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "123pan-api-sdk",
              platform: "web",
              "app-version": "3",
            },
          },
        );
        responseStatus = response.status;
        responseBody = response.data;
        if (isSuccessCode(response.data.code)) {
          token = response.data.data?.token || response.data.data?.accessToken || "";
        }
      } else if (this.canUseOpenAuth()) {
        this.logger.debug("Requesting Open API access token");
        const response = await this.httpClient.post<AccessTokenResponse>(
          "/api/v1/access_token",
          {
            clientID: this.clientID,
            clientSecret: this.clientSecret,
          },
        );
        responseStatus = response.status;
        responseBody = response.data;
        if (isSuccessCode(response.data.code)) {
          token = response.data.data?.accessToken || "";
        }
      } else {
        throw new Error(
          "认证配置无效：请提供 token、passport + password，或显式使用 Open API 的 clientID + clientSecret",
        );
      }

      this.logger.debug("Token API response received", {
        status: responseStatus,
        data: responseBody,
      });

      if (!token) {
        throw new Error("登录失败：响应中没有有效 token");
      }

      const expiresAt = parseJwtExpiration(token);
      const expiresInMs = Math.max(expiresAt - Date.now(), 60_000);

      this.tokenInfo = {
        accessToken: token,
        expiresAt,
        tokenType: "Bearer",
      };

      // 更新最后刷新时间
      this.lastRefreshTime = Date.now();

      // 保存到多级缓存
      if (this.cacheManager) {
        await this.cacheManager.setTokenInfo(this.tokenInfo);
      }

      this.saveTokenToCache();

      this.logger.debug("Access token received and stored", {
        tokenType: "Bearer",
        expiresAt: new Date(this.tokenInfo.expiresAt).toISOString(),
        expiresInSeconds: expiresInMs / 1000,
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

  private canUseNormalAuth(): boolean {
    return !!(this.passport && this.password);
  }

  private canUseOpenAuth(): boolean {
    return !!(this.clientID && this.clientSecret);
  }

  /**
   * 检查认证配置是否有效
   */
  isConfigValid(): boolean {
    return !!(
      this.config.token ||
      (this.passport && this.password) ||
      (this.clientID &&
        this.clientSecret &&
        this.baseURL.includes("open-api.123pan.com"))
    );
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

  private setDirectToken(token: string): void {
    const parsedToken = token.replace(/^Bearer\s+/i, "");
    const expiresAt = parseJwtExpiration(parsedToken);

    this.tokenInfo = {
      accessToken: parsedToken,
      expiresAt,
      tokenType: "Bearer",
    };

    this.logger.info("Using direct token", {
      expiresAt: new Date(expiresAt).toISOString(),
      tokenLength: parsedToken.length,
    });
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

function isSuccessCode(code: number): boolean {
  return code === 0 || code === 200;
}

function parseJwtExpiration(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] || "", "base64url").toString("utf-8"),
    ) as { exp?: number };

    if (typeof payload.exp === "number" && payload.exp > 0) {
      return payload.exp * 1000;
    }
  } catch {
    // Some gateway tokens are not JWTs; fall back to a conservative lifetime.
  }

  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}
