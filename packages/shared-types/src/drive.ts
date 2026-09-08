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
  startedAt: number
  finishedAt?: number
}

export interface AppSettings {
  /** 默认下载目录；null 时使用系统下载目录 */
  downloadDir: string | null
  /** 每次下载询问保存位置 */
  askWhereToSave: boolean
}
