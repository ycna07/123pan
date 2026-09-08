import { createWriteStream, existsSync, unlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { once } from 'node:events'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  DriveFileType,
  DriveItem,
  DownloadProgress,
  DownloadTask,
  StorageUsage,
  UploadProgress
} from '@123pan/shared-types'
import { getSettings } from './settings'
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

/** 统一包装：SDK 抛出的 ApiError 等非 Error 对象跨 IPC 会丢失消息，这里归一为 Error */
function registerHandler<T extends unknown[]>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => Promise<unknown> | unknown
): void {
  ipcMain.handle(channel, async (event, ...args: T) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      const message = (error as { message?: string }).message || String(error)
      throw new Error(message)
    }
  })
}

export function registerDriveHandlers(): void {
  registerHandler('drive:list', (_event, folderId: string | null) => {
    return fetchFolderItems(toFolderId(folderId, '目录 ID'))
  })

  registerHandler('drive:usage', async (): Promise<StorageUsage> => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const response = await sdk.user.getUserInfo()
    const info = response.data
    if (!info?.uid) throw new Error('获取存储空间信息失败')
    return {
      used: info.spaceUsed,
      permanent: info.spacePermanent,
      temp: info.spaceTemp
    }
  })

  registerHandler('drive:move', async (_event, fileIds: string[], targetFolderId: string | null) => {
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

  registerHandler('drive:copy', async (_event, fileIds: string[], targetFolderId: string | null) => {
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

  registerHandler('drive:download-link', async (_event, fileId: string) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const info = await sdk.file.getDownloadInfo({ fileId })
    return { url: info.data.downloadUrl }
  })

  registerHandler(
    'drive:download',
    async (_event, fileId: string, suggestedName: string, savePath?: string) => {
      const sdk = getSdk()
      if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
      const info = await sdk.file.getDownloadInfo({ fileId })
      const url = info.data.downloadUrl
      const name = basename(suggestedName)

      const settings = getSettings()
      let filePath = savePath
      if (!filePath) {
        if (settings.askWhereToSave) {
          const choice = await dialog.showSaveDialog({
            defaultPath: settings.downloadDir ? join(settings.downloadDir, name) : name
          })
          if (choice.canceled || !choice.filePath) return { canceled: true }
          filePath = choice.filePath
        } else {
          filePath = resolveTargetPath(name)
        }
      }

      const task: DownloadTask = {
        id: randomUUID(),
        fileId,
        name,
        path: filePath,
        size: 0,
        received: 0,
        status: 'downloading',
        startedAt: Date.now()
      }
      downloadTasks.set(task.id, task)
      emitTask(task)
      void runDownload(task, url)
      return { canceled: false, id: task.id, path: filePath }
    }
  )

  registerHandler('drive:downloads:list', () =>
    [...downloadTasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  )

  registerHandler('drive:download-cancel', (_event, id: string) => {
    aborters.get(id)?.abort()
    return true
  })

  registerHandler('drive:downloads:reveal', (_event, id: string) => {
    const task = downloadTasks.get(id)
    if (task?.status === 'completed' && existsSync(task.path)) {
      shell.showItemInFolder(task.path)
    }
    return true
  })

  registerHandler('drive:copy-link', async (_event, fileId: string) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const info = await sdk.file.getDownloadInfo({ fileId })
    clipboard.writeText(info.data.downloadUrl)
    return info.data.downloadUrl
  })

  registerHandler('drive:mkdir', async (_event, parentFolderId: string | null, name: string) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const trimmed = name.trim()
    if (!trimmed) throw new Error('请输入文件夹名称')
    const parentID = toFolderId(parentFolderId, '目录 ID')
    const created = await sdk.file.upload.createFolder({ name: trimmed, parentID })
    if (created.code !== 0 || !created.data?.dirID) {
      throw new Error(created.message || '新建文件夹失败')
    }
    return { id: String(created.data.dirID), name: trimmed }
  })

  registerHandler(
    'drive:upload',
    async (_event, filePath: string, parentFolderId: string | null) => {
      const sdk = getSdk()
      if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
      const buffer = await readFile(filePath)
      const name = basename(filePath)
      const parentFileID = toFolderId(parentFolderId, '目录 ID')
      const result = await sdk.file.upload.uploadFile({
        filename: name,
        file: buffer,
        parentFileID,
        duplicate: 1,
        onProgress: (progress) => {
          const uploadProgress: UploadProgress = {
            name,
            received: progress.loaded,
            total: progress.total
          }
          broadcast('drive:upload-progress', uploadProgress)
        }
      })
      if (!result.fileID) {
        throw new Error('上传失败：未获取到文件 ID')
      }
      return { fileID: String(result.fileID), name, reused: result.isReuse }
    }
  )

  registerHandler('drive:offline', async (_event, url: string, parentFolderId: string | null) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const trimmed = url.trim()
    if (!trimmed) throw new Error('请输入离线下载链接')
    const task = await sdk.offline.createTask({
      url: trimmed,
      parentId: toFolderId(parentFolderId, '目录 ID')
    })
    if (task.code !== 0 || !task.data) {
      throw new Error(task.message || '创建离线下载任务失败')
    }
    return { taskId: task.data.taskId, name: task.data.taskName }
  })
}

interface DownloadTaskInternal extends DownloadTask {
  controller?: AbortController
}

const downloadTasks = new Map<string, DownloadTaskInternal>()
const aborters = new Map<string, AbortController>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function emitTask(task: DownloadTaskInternal): void {
  const serialized: DownloadTask = {
    id: task.id,
    fileId: task.fileId,
    name: task.name,
    path: task.path,
    size: task.size,
    received: task.received,
    status: task.status,
    ...(task.error && { error: task.error }),
    startedAt: task.startedAt,
    ...(task.finishedAt !== undefined && { finishedAt: task.finishedAt })
  }
  broadcast('drive:download-updated', serialized)
}

function emitProgress(task: DownloadTaskInternal): void {
  const progress: DownloadProgress = {
    id: task.id,
    fileId: task.fileId,
    name: task.name,
    received: task.received,
    total: task.size
  }
  broadcast('drive:download-progress', progress)
}

/** 按“默认下载目录 + 自动重命名”解析落盘路径；askWhereToSave 时返回空串表示交给对话框 */
function resolveTargetPath(name: string): string {
  const settings = getSettings()
  const dir = settings.downloadDir || app.getPath('downloads')
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  // 已有文件占用，或注册表中存在同路径的活动任务（下载尚未落盘的窗口期）
  const taken = (path: string): boolean =>
    existsSync(path) ||
    [...downloadTasks.values()].some((t) => t.path === path && t.status === 'downloading')
  let candidate = join(dir, name)
  let index = 1
  while (taken(candidate)) {
    candidate = join(dir, `${base}(${index++})${ext}`)
  }
  return candidate
}

async function runDownload(task: DownloadTaskInternal, url: string): Promise<void> {
  const controller = new AbortController()
  task.controller = controller
  aborters.set(task.id, controller)
  let writer: ReturnType<typeof createWriteStream> | null = null
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok || !response.body) {
      throw new Error(`下载失败：HTTP ${response.status}`)
    }
    task.size = Number(response.headers.get('content-length') ?? 0)
    writer = createWriteStream(task.path)
    let lastEmit = 0
    for await (const chunk of response.body) {
      if (!writer.write(chunk)) await once(writer, 'drain')
      task.received += chunk.length
      const now = Date.now()
      if (now - lastEmit > 300) {
        lastEmit = now
        emitProgress(task)
        emitTask(task)
      }
    }
    writer.end()
    await once(writer, 'finish')
    task.status = 'completed'
    task.finishedAt = Date.now()
  } catch (error) {
    task.status = controller.signal.aborted ? 'canceled' : 'failed'
    task.error = controller.signal.aborted ? undefined : String((error as Error).message || error)
    writer?.end()
    if (writer) await once(writer, 'finish')
    // 取消/失败时清理半成品文件
    if (existsSync(task.path)) unlinkSync(task.path)
  } finally {
    aborters.delete(task.id)
    task.finishedAt = task.finishedAt ?? Date.now()
    emitProgress(task)
    emitTask(task)
  }
}
