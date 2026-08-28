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
  size: number
  updatedAt: string
  starred?: boolean
}
