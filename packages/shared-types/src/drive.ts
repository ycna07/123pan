export interface AppVersions {
  electron?: string
  chrome?: string
  node?: string
}

export type DriveFileType = 'folder' | 'doc' | 'image' | 'video' | 'audio' | 'archive' | 'other'

export interface DriveItem {
  id: string
  name: string
  type: DriveFileType
  parentId: string | null
  size: number
  updatedAt: string
  starred?: boolean
}

export interface StorageUsage {
  used: number
  permanent: number
  temp: number
}

export interface DownloadProgress {
  id: string
  fileId: string
  name: string
  received: number
  total: number
}

export interface UploadProgress {
  name: string
  received: number
  total: number
}

export type UploadTaskStatus = 'uploading' | 'completed' | 'failed' | 'canceled'

export interface UploadTask {
  id: string
  name: string
  path: string
  size: number
  received: number
  status: UploadTaskStatus
  error?: string
  /** 存在可续传的上传会话 */
  resumable?: boolean
  startedAt: number
  finishedAt?: number
}

export interface ReuseExportResult {
  count: number
  skipped: number
  bytes: number
  json: string
}

export interface ShareRecord {
  id: string
  name: string
  key: string
  url: string
  pwd: string
  expired: boolean
  expireAt: string
  createdAt: string
  previewCount: number
  downloadCount: number
  saveCount: number
}

export type DownloadTaskStatus = 'downloading' | 'completed' | 'failed' | 'canceled'

export interface DownloadTask {
  id: string
  fileId: string
  name: string
  path: string
  size: number
  received: number
  status: DownloadTaskStatus
  error?: string
  /** 存在可续传的分片状态（取消/失败后可继续下载） */
  resumable?: boolean
  startedAt: number
  finishedAt?: number
}

export interface AppSettings {
  /** 默认下载目录；null 时使用系统下载目录 */
  downloadDir: string | null
  /** 每次下载询问保存位置 */
  askWhereToSave: boolean
  /** 下载线程数（并发连接数，1-8） */
  downloadThreads: number
}
