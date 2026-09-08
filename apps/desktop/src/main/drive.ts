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

function toFolderId(folderId: string | null, label: string): number {
  const id = folderId === null ? 0 : Number(folderId)
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`无效的${label}：${String(folderId)}`)
  }
  return id
}

export function registerDriveHandlers(): void {
  ipcMain.handle('drive:list', (_event, folderId: string | null) => {
    return fetchFolderItems(toFolderId(folderId, '目录 ID'))
  })

  ipcMain.handle('drive:move', async (_event, fileIds: string[], targetFolderId: string | null) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('请选择要移动的文件')
    }
    const targetId = toFolderId(targetFolderId, '目标目录 ID')
    const response = await sdk.file.moveFiles({
      fileIDs: fileIds.map((id) => Number(id)),
      toParentFileID: targetId
    })
    if (response.code !== 0) {
      throw new Error(response.message || '移动文件失败')
    }
    return fileIds.map((id) => String(id))
  })

  ipcMain.handle('drive:copy', async (_event, fileIds: string[], targetFolderId: string | null) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('请选择要复制的文件')
    }
    const targetId = toFolderId(targetFolderId, '目标目录 ID')
    const created = await sdk.file.copyFiles({
      fileIDs: fileIds.map((id) => Number(id)),
      toParentFileID: targetId
    })
    if (created.code !== 0 || !created.data?.taskId) {
      throw new Error(created.message || '创建复制任务失败')
    }
    // 复制是异步任务，轮询直到完成（status 2 / errorCode 0）
    const deadline = Date.now() + 15_000
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      const task = await sdk.file.getCopyTask(created.data.taskId)
      const info = task.data
      if (task.code !== 0 || !info) {
        throw new Error(task.message || '查询复制任务失败')
      }
      if (info.errorCode !== 0) {
        throw new Error(info.reason || '复制文件失败')
      }
      if (info.status === 2) break
      if (Date.now() > deadline) {
        throw new Error('复制任务超时，请稍后手动刷新查看结果')
      }
    }
    return fileIds
  })
}
