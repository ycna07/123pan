/**
 * 123pan SDK 类型定义
 */

// SDK配置接口
export interface SdkConfig {
  /** 普通用户 API：直接传入网页端 JWT token */
  token?: string;
  /** 普通用户 API：账号（手机号或邮箱），与 password 一起使用 */
  passport?: string;
  /** 普通用户 API：账号密码，与 passport 一起使用 */
  password?: string;
  baseURL?: string;
  loginBaseURL?: string;
  /** 普通用户 API 请求头，一般保持默认随机值即可 */
  loginuuid?: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  // 预设token（仅在debug模式下生效）
  debugToken?: string;
  // 限流配置
  rateLimitConfig?: {
    maxRequests?: number;
    perMilliseconds?: number;
    maxRetries?: number;
  };
  // 日志配置
  loggerConfig?: {
    level?: "DEBUG" | "INFO" | "WARN" | "ERROR" | "SILENT";
    enableConsole?: boolean;
    enableRemote?: boolean;
    remoteEndpoint?: string;
    colors?: boolean;
    maxEntries?: number;
  };
  // 缓存配置
  cacheConfig?: {
    enabled?: boolean;
    cacheDir?: string;
    fileName?: string;
  };
}

// 认证相关
export interface AccessTokenData {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  token?: string;
}

export interface AccessTokenResponse extends ApiResponse<AccessTokenData> {}

export interface TokenInfo {
  accessToken: string;
  expiresAt: number;
  tokenType: string;
}

// 扫码登录相关
/** 扫码状态：0 等待扫码；1 已扫码；2 已取消；3 已登录（处理中）；4 已失效 */
export type QrCodeLoginStatus = 0 | 1 | 2 | 3 | 4;

/** 二维码登录会话，qrUrl 为二维码内容，可直接渲染成二维码图片 */
export interface QrLoginSession {
  uniID: string;
  qrUrl: string;
}

/** 轮询二维码登录结果 */
export type QrLoginPollResult =
  | { status: "waiting" | "scanned" | "logging" }
  | { status: "cancelled" | "expired"; message: string }
  | { status: "success"; token: string };

// API响应基础结构
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  "x-traceID"?: string; // 追踪ID，用于问题排查
}

// 错误响应
export interface ApiError {
  code: number;
  message: string;
  details?: any;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  limit: number;
}

// 文件信息
export interface FileInfo {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileMd5?: string;
  fileType: string;
  createTime: string;
  updateTime: string;
  parentId: string;
  isDir: boolean;
  downloadUrl?: string;
  previewUrl?: string;
}

// 用户信息
export interface UserInfo {
  uid: number;
  nickname: string;
  headImage?: string;
  passport?: string;
  mail?: string;
  spaceUsed: number;
  spacePermanent: number;
  spaceTemp: number;
  /** 临时空间到期时间；普通用户 API 返回字符串 */
  spaceTempExpr: string;
  vip: boolean;
  vipLabel?: string;
  directTraffic: number;
  isHideUID?: boolean;
  httpsCount: number;
  vipInfo?: any[];
  developerInfo?: any;
}

// 分享信息
export interface ShareInfo {
  shareId: string;
  shareUrl: string;
  shareCode?: string;
  expireTime?: string;
  downloadCount: number;
  maxDownloadCount?: number;
  createTime: string;
  isExpired: boolean;
}

// 离线下载任务
export interface OfflineTask {
  taskId: string;
  taskName: string;
  taskUrl: string;
  taskStatus:
    | "pending"
    | "downloading"
    | "completed"
    | "failed"
    | "paused"
    | "retrying";
  progress: number;
  fileSize?: number;
  downloadSpeed?: number;
  createTime: string;
  completeTime?: string;
  errorMessage?: string;
}

// HTTP方法类型
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// 上传进度回调
export type UploadProgressCallback = (progress: {
  loaded: number;
  total: number;
  percentage: number;
}) => void;

// 请求配置
export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

// 限流器接口
export interface RateLimiter {
  checkLimit(): Promise<void>;
  reset(): void;
}
