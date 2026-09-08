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
  fileId: string
  name: string
  received: number
  total: number
}
