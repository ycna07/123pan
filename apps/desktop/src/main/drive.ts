import { ipcMain } from 'electron'
import type { DriveFileType, DriveItem } from '@123pan/shared-types'
import { getSdk } from './auth'

const EXT_TYPES: Array<[DriveFileType, string[]]> = [
  [
    'doc',
    [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.md',
      '.txt',
      '.csv',
      '.epub',
      '.rtf'
    ]
  ],
  ['image', ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.ico']],
  ['video', ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts']],
  ['audio', ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.ape']],
  ['archive', ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']]
]

const AUDIO_CATEGORY = 1
const VIDEO_CATEGORY = 2
const IMAGE_CATEGORY = 3

const PAGE_SIZE = 100
const MAX_PAGES = 20

function classifyByExtension(name: string): DriveFileType {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return 'other'
  const ext = name.slice(dot).toLowerCase()
  for (const [type, exts] of EXT_TYPES) {
    if (exts.includes(ext)) return type
  }
  return 'other'
}

function toDriveItem(raw: {
  fileId: number
  filename: string
  type: number
  size: number
  category: number
  parentFileId: number
  updateAt?: string
}): DriveItem {
  let type: DriveFileType
  if (raw.type === 1) {
    type = 'folder'
  } else if (raw.category === AUDIO_CATEGORY) {
    type = 'audio'
  } else if (raw.category === VIDEO_CATEGORY) {
    type = 'video'
  } else if (raw.category === IMAGE_CATEGORY) {
    type = 'image'
  } else {
    type = classifyByExtension(raw.filename)
  }
  return {
    id: String(raw.fileId),
    name: raw.filename,
    type,
    parentId: raw.parentFileId === 0 ? null : String(raw.parentFileId),
    size: raw.size,
    ...(raw.updateAt ? { updatedAt: raw.updateAt } : { updatedAt: '' })
  }
}

async function fetchFolderItems(parentFileId: number): Promise<DriveItem[]> {
  const sdk = getSdk()
  if (!sdk) throw new Error('未登录或登录已过期，请重新登录')

  const items: DriveItem[] = []
  let lastFileId: number | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await sdk.file.getFileList({
      parentFileId,
      limit: PAGE_SIZE,
      ...(lastFileId !== undefined && { lastFileId })
    })
    items.push(...response.data.fileList.map(toDriveItem))
    lastFileId = response.data.lastFileId
    if (lastFileId === -1) break
  }
  return items
}

export function registerDriveHandlers(): void {
  ipcMain.handle('drive:list', (_event, folderId: string | null) => {
    const parentFileId = folderId === null ? 0 : Number(folderId)
    if (!Number.isInteger(parentFileId) || parentFileId < 0) {
      throw new Error(`无效的目录 ID：${String(folderId)}`)
    }
    return fetchFolderItems(parentFileId)
  })
}
