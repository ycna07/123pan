/** 创建目录返回数据 */
export interface ICreateFolderResponse {
  /** 创建的目录ID */
  dirID: number
}

/** 创建文件返回数据 */
export interface ICreateFileResponse {
  /** 文件ID。当123云盘已有该文件,则会发生秒传。此时会将文件ID字段返回。唯一 */
  fileID?: number
  /** 预上传ID(如果 reuse 为 true 时,该字段不存在) */
  preuploadID?: string
  /** 是否秒传，返回true时表示文件已上传成功 */
  reuse: boolean
  /** 分片大小，必须按此大小生成文件分片再上传 */
  sliceSize: number
  /** 上传地址 */
  servers: string[]
}

/** 上传分片返回数据 */
export interface IUploadSliceResponse {
  // 上传成功，data 为 null
}

/** 上传完成返回数据 */
export interface IUploadCompleteResponse {
  /** 上传是否完成 */
  completed: boolean
  /** 上传完成文件id */
  fileID: number
}

/** 获取上传域名返回数据 */
export interface IGetUploadDomainResponse {
  /** 上传域名数组，存在多个可以任选其一 */
  data: string[]
}

/** 单步上传返回数据 */
export interface ISingleUploadResponse {
  /** 文件ID。当123云盘已有该文件,则会发生秒传。此时会将文件ID字段返回。唯一 */
  fileID: number
  /** 是否上传完成（如果 completed 为 true 时，则说明上传完成） */
  completed: boolean
}

/** 上传进度回调函数 */
export interface UploadProgressCallback {
  (progress: {
    /** 已上传字节数 */
    loaded: number
    /** 总字节数 */
    total: number
    /** 上传百分比 (0-100) */
    percent: number
    /** 当前上传的分片序号 */
    currentSlice?: number
    /** 总分片数 */
    totalSlices?: number
  }): void
}

/** 可续传的上传会话（upload_request 返回的 S3 上下文 + 分片信息） */
export interface IUploadSession {
  /** upload_request 返回的文件 ID */
  FileId: number
  bucket: string
  key: string
  storageNode: string
  uploadId: string
  /** 分片大小（字节） */
  sliceSize: number
  /** 分片总数 */
  totalParts: number
  /** 是否为多分片上传 */
  isMultipart: boolean
}

/** 上传文件参数（Node.js环境） */
export interface IUploadFileParams {
  /** 文件名：要小于255个字符且不能包含以下任何字符："\/:*?|><。（注：不能重名） */
  filename: string
  /** 文件数据（Buffer、Uint8Array、ArrayBuffer）；与 filePath 二选一 */
  file?: ArrayBuffer | Buffer | Uint8Array
  /** 文件路径：按分片流式读取，支持超大文件（>2GiB，避免整文件读入内存） */
  filePath?: string
  /** 文件md5（可选，如果不提供会自动计算） */
  etag?: string
  /** 父目录id，上传到根目录时填写 0 */
  parentFileID?: number
  /** 上传进度回调 */
  onProgress?: UploadProgressCallback
  /** 轮询间隔（毫秒），默认1000ms（仅在同步模式下有效） */
  pollInterval?: number
  /** 最大轮询次数，默认300次（5分钟）（仅在同步模式下有效） */
  maxPollAttempts?: number
  /** 当有相同文件名时，文件处理策略（1保留两者，新文件名将自动添加后缀，2覆盖原文件） */
  duplicate?: number
  /** 上传文件是否包含路径，默认false */
  containDir?: boolean
  /** 是否使用单步上传（文件小于1GB时），默认根据文件大小自动选择 */
  useSingleUpload?: boolean
  /** 是否异步模式，默认false（同步模式会等待上传完成并轮询结果）
   * - false: 同步模式，等待上传完成并自动轮询直到获得结果
   * - true: 异步模式，上传完成后立即返回，需要手动调用 queryUploadResult 查询结果
   */
  asyncMode?: boolean
  /** 取消信号：中断分片上传 */
  signal?: AbortSignal
  /** 续传会话：提供后跳过 upload_request，沿用原会话继续上传 */
  resumeSession?: IUploadSession
  /** 已上传完成的分片号（从 1 开始），续传时跳过 */
  completedParts?: number[]
  /** 上传会话就绪回调（可持久化用于断点续传） */
  onSession?: (session: IUploadSession) => void
  /** 单个分片上传成功回调（可持久化已上传分片） */
  onPartComplete?: (partNumber: number) => void
}

/** 上传文件返回结果 */
export interface IUploadFileResult {
  /** 文件ID（同步模式下，上传完成时返回；异步模式下，如果秒传则返回，否则为0） */
  fileID: number
  /** 是否秒传 */
  isReuse: boolean
  /** 是否使用单步上传 */
  isSingleUpload: boolean
  /** 预上传ID（异步模式下返回，用于后续查询上传结果；同步模式下为undefined） */
  preuploadID?: string
  /** 是否异步模式 */
  isAsync?: boolean
  /** 本次上传的会话（用于断点续传） */
  session?: IUploadSession
}
