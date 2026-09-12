import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  DriveFileType,
  DriveItem,
  DownloadProgress,
  DownloadTask,
  ReuseExportResult,
  StorageUsage,
  UploadProgress,
  UploadTask
} from '@123pan/shared-types'
import { calculateFileMD5, getFilePathSize } from '@123pan/api-sdk'
import type { FileListItem, IUploadSession, Pan123SDK } from '@123pan/api-sdk'
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
const REUSE_STEP_DELAY_MS = 150
const MAX_EXPORT_FILES = 5000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 与 123FastLink 一致的 base62 字符表 */
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** 与 p123client.escape_filename 一致：Windows 非法字符转全角 */
const FULLWIDTH_OFFSET = 0xfee0

function base62ToHex(b62: string): string {
  let num = 0
  for (const ch of b62) {
    num = num * 62 + BASE62_CHARS.indexOf(ch)
  }
  if (num <= 0) return ''
  return num.toString(16).padStart(32, '0').toLowerCase()
}

function sanitizeReuseName(name: string): string {
  let out = ''
  for (const ch of name) {
    out += '"\\/:*?|><'.includes(ch) ? String.fromCharCode(ch.charCodeAt(0) + FULLWIDTH_OFFSET) : ch
  }
  return out
}

interface ReusePlanFile {
  fileName: string
  etag: string
  size: number
  dirParts: string[]
}

/** 解析 123FastLink 导出的秒传 JSON（支持 base62 etag 与 commonPath 前缀） */
function parseReuseJson(jsonText: string): { files: ReusePlanFile[]; commonPath: string } {
  interface ReuseExportFile {
    etag?: unknown
    size?: unknown
    path?: unknown
  }
  interface ReuseExport {
    files?: ReuseExportFile[]
    commonPath?: unknown
    usesBase62EtagsInExport?: unknown
  }
  let data: ReuseExport
  try {
    data = JSON.parse(jsonText) as ReuseExport
  } catch {
    throw new Error('粘贴的内容不是合法 JSON')
  }
  const files = data?.files
  if (!Array.isArray(files)) {
    throw new Error('JSON 中缺少 files 数组（需为 123FastLink 导出格式）')
  }
  const commonPath = String(data.commonPath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const usesBase62 = data.usesBase62EtagsInExport === true

  const plan: ReusePlanFile[] = []
  for (const raw of files) {
    let etag = String(raw?.etag ?? '')
    if (!etag) continue
    if (usesBase62) etag = base62ToHex(etag)
    if (!/^[0-9a-f]{32}$/.test(etag.toLowerCase())) continue
    const path = String(raw?.path ?? '').replace(/\\/g, '/')
    const fileName = sanitizeReuseName(path.split('/').pop() || path)
    const dirPath = commonPath
      ? `${commonPath}/${path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''}`
      : path.includes('/')
        ? path.slice(0, path.lastIndexOf('/'))
        : ''
    const dirParts = dirPath
      .split('/')
      .map((part) => sanitizeReuseName(part))
      .filter(Boolean)
    plan.push({
      fileName,
      etag: etag.toLowerCase(),
      size: Number(raw?.size ?? 0),
      dirParts
    })
  }
  return { files: plan, commonPath }
}

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

async function fetchAllPages(
  fetchPage: (
    lastFileId?: number
  ) => Promise<{ data: { lastFileId: number; fileList: FileListItem[] } }>
): Promise<DriveItem[]> {
  const items: DriveItem[] = []
  let lastFileId: number | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchPage(lastFileId)
    items.push(...response.data.fileList.map(toDriveItem))
    lastFileId = response.data.lastFileId
    if (lastFileId === -1) break
  }
  return items
}

async function fetchFolderItems(parentFileId: number): Promise<DriveItem[]> {
  const sdk = getSdk()
  if (!sdk) throw new Error('未登录或登录已过期，请重新登录')

  return fetchAllPages((lastFileId) =>
    sdk.file.getFileList({
      parentFileId,
      limit: PAGE_SIZE,
      ...(lastFileId !== undefined && { lastFileId })
    })
  )
}

async function fetchTrashItems(): Promise<DriveItem[]> {
  const sdk = getSdk()
  if (!sdk) throw new Error('未登录或登录已过期，请重新登录')

  return fetchAllPages((lastFileId) =>
    sdk.file.getTrashFileList({
      limit: PAGE_SIZE,
      ...(lastFileId !== undefined && { lastFileId })
    })
  )
}

function toFolderId(folderId: string | null, label: string): number {
  const id = folderId === null ? 0 : Number(folderId)
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`无效的${label}：${String(folderId)}`)
  }
  return id
}

/** 递归收集目录下的所有文件（含相对路径），列表接口已直接返回 Etag */
async function collectFolderFiles(
  sdk: Pan123SDK,
  dirPath: string,
  folderId: number,
  out: Array<{ path: string; etag: string; size: number }>,
  state: { skipped: number }
): Promise<void> {
  let lastFileId: number | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const listing = await sdk.file.getFileList({
      parentFileId: folderId,
      limit: PAGE_SIZE,
      ...(lastFileId !== undefined && { lastFileId })
    })
    for (const item of listing.data.fileList) {
      const childPath = `${dirPath}/${item.filename}`
      if (item.type === 1) {
        await collectFolderFiles(sdk, childPath, item.fileId, out, state)
      } else if (item.etag) {
        out.push({ path: childPath, etag: item.etag.toLowerCase(), size: item.size })
      } else {
        state.skipped++
      }
      if (out.length > MAX_EXPORT_FILES) {
        throw new Error(`导出文件数超过上限（${MAX_EXPORT_FILES}），请分文件夹导出`)
      }
    }
    lastFileId = listing.data.lastFileId
    if (lastFileId === -1) break
  }
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

  registerHandler('drive:trash:list', () => fetchTrashItems())

  registerHandler('drive:trash:restore', async (_event, fileIds: string[]) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('请选择要恢复的文件')
    }
    const response = await sdk.file.restoreFiles({ fileIDs: fileIds.map((id) => Number(id)) })
    if (response.code !== 0) {
      throw new Error(response.message || '恢复文件失败')
    }
    return fileIds.map((id) => String(id))
  })

  registerHandler('drive:trash:delete', async (_event, fileIds: string[]) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('请选择要彻底删除的文件')
    }
    const response = await sdk.file.permanentDeleteFiles({
      fileIDs: fileIds.map((id) => Number(id))
    })
    if (response.code !== 0) {
      throw new Error(response.message || '彻底删除文件失败')
    }
    return fileIds.map((id) => String(id))
  })

  registerHandler('drive:delete', async (_event, fileIds: string[]) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('请选择要删除的文件')
    }
    const response = await sdk.file.deleteFiles({ fileIDs: fileIds.map((id) => Number(id)) })
    if (response.code !== 0) {
      throw new Error(response.message || '删除文件失败')
    }
    return fileIds.map((id) => String(id))
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

  registerHandler(
    'drive:move',
    async (_event, fileIds: string[], targetFolderId: string | null) => {
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
    }
  )

  registerHandler(
    'drive:copy',
    async (_event, fileIds: string[], targetFolderId: string | null) => {
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
    }
  )

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

  registerHandler('drive:download-resume', async (_event, id: string) => {
    const task = downloadTasks.get(id)
    if (!task) throw new Error('下载任务不存在')
    if (task.status === 'downloading') return { id: task.id }
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    // 重新获取下载地址（旧地址可能已过期），沿用原目标路径以命中分片状态
    const info = await sdk.file.getDownloadInfo({ fileId: task.fileId })
    task.status = 'downloading'
    delete task.error
    delete task.finishedAt
    emitTask(task)
    void runDownload(task, info.data.downloadUrl)
    return { id: task.id }
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

  registerHandler('drive:upload', (_event, filePath: string, parentFolderId: string | null) => {
    const sdk = getSdk()
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    const parentId = toFolderId(parentFolderId, '目录 ID')
    const task: UploadTaskInternal = {
      id: randomUUID(),
      name: basename(filePath),
      path: filePath,
      size: 0,
      received: 0,
      status: 'uploading',
      startedAt: Date.now()
    }
    uploadTasks.set(task.id, task)
    emitUploadTask(task)
    void runUpload(task, parentId)
    return { id: task.id }
  })

  registerHandler('drive:uploads:list', () =>
    [...uploadTasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  )

  registerHandler('drive:upload-cancel', (_event, id: string) => {
    uploadAborters.get(id)?.abort()
    return true
  })

  registerHandler('drive:upload-resume', (_event, id: string) => {
    const task = uploadTasks.get(id)
    if (!task) throw new Error('上传任务不存在')
    if (task.status === 'uploading') return { id: task.id }
    task.status = 'uploading'
    delete task.error
    delete task.finishedAt
    emitUploadTask(task)
    void runUpload(task, task.parentFolderId ?? 0)
    return { id: task.id }
  })

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

  registerHandler(
    'drive:reuse-save',
    async (_event, parentFolderId: string | null, jsonText: string) => {
      const sdk = getSdk()
      if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
      const rootId = toFolderId(parentFolderId, '目录 ID')
      const plan = parseReuseJson(jsonText)
      if (plan.files.length === 0) throw new Error('JSON 中没有文件条目')

      const dirIds = new Map<string, number>([['', rootId]])
      let createdDirs = 0
      let savedCount = 0
      const failed: Array<{ name: string; error: string }> = []
      const done = async (current: string, ok: boolean): Promise<void> => {
        broadcast('drive:reuse-progress', {
          done: createdDirs + savedCount + failed.length,
          total: plan.files.length,
          current,
          ok
        })
      }

      for (const file of plan.files) {
        try {
          // 逐级确保目录存在（先查已加载的同名目录，再创建）
          let parent = rootId
          let acc = ''
          for (const part of file.dirParts) {
            acc = acc ? `${acc}/${part}` : part
            const cached = dirIds.get(acc)
            if (cached !== undefined) {
              parent = cached
              continue
            }
            const listing = await sdk.file.getFileList({ parentFileId: parent, limit: 100 })
            const existing = listing.data.fileList.find(
              (item) => item.type === 1 && item.filename === part
            )
            let id: number
            if (existing) {
              id = existing.fileId
            } else {
              const created = await sdk.file.upload.createFolder({
                name: part,
                parentID: parent,
                duplicate: 1
              })
              if (created.code !== 0 || !created.data?.dirID) {
                throw new Error(created.message || `创建目录「${part}」失败`)
              }
              id = created.data.dirID
              createdDirs++
              await sleep(REUSE_STEP_DELAY_MS)
            }
            dirIds.set(acc, id)
            parent = id
          }

          const saved = await sdk.file.reuseUpload({
            fileName: file.fileName,
            etag: file.etag,
            size: file.size,
            parentFileID: parent,
            duplicate: 1
          })
          if (!saved.data.reused) {
            throw new Error('云端不存在相同文件，无法秒传')
          }
          savedCount++
          await done(file.fileName, true)
          await sleep(REUSE_STEP_DELAY_MS)
        } catch (error) {
          const message = (error as { message?: string }).message || String(error)
          failed.push({ name: file.fileName, error: message })
          await done(file.fileName, false)
        }
      }

      return {
        total: plan.files.length,
        createdDirs,
        savedCount,
        failed
      }
    }
  )

  registerHandler(
    'drive:export-reuse',
    async (_event, fileIds: string[]): Promise<ReuseExportResult> => {
      const sdk = getSdk()
      if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        throw new Error('请选择要生成秒传 JSON 的文件或文件夹')
      }

      const files: Array<{ path: string; etag: string; size: number }> = []
      const state = { skipped: 0 }

      for (const id of fileIds) {
        const info = await sdk.file.getFileInfos({ fileIds: [Number(id)] })
        const item = info.data.list[0]
        if (!item) throw new Error(`未找到文件：${id}`)
        if (item.type === 1) {
          await collectFolderFiles(sdk, item.filename, item.fileId, files, state)
        } else if (item.etag) {
          files.push({ path: item.filename, etag: item.etag.toLowerCase(), size: item.size })
        } else {
          state.skipped++
        }
      }

      if (files.length === 0) {
        throw new Error(
          state.skipped > 0
            ? '所选文件的 MD5 缺失，无法生成秒传 JSON'
            : '所选内容为空文件夹，没有可导出的文件'
        )
      }
      files.sort((a, b) => a.path.localeCompare(b.path))
      const json = JSON.stringify(
        { files, commonPath: '', usesBase62EtagsInExport: false },
        null,
        1
      )
      clipboard.writeText(json)
      return { count: files.length, skipped: state.skipped, bytes: Buffer.byteLength(json), json }
    }
  )
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
    ...(task.resumable && { resumable: true }),
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

// ---------- 多线程下载 + 断点续传 ----------

const MIN_CHUNK_SIZE = 1024 * 1024
const MAX_CHUNK_SIZE = 8 * 1024 * 1024
const MAX_THREADS = 8
const MAX_CHUNK_RETRIES = 3

interface DownloadStateFile {
  /** 文件 id（下载地址每次重新签发，不能用 URL 判断是否为同一文件） */
  fileId: string
  size: number
  chunkSize: number
  completed: number[]
}

function partPaths(filePath: string): { part: string; state: string } {
  return { part: `${filePath}.part`, state: `${filePath}.part.json` }
}

/** 探测文件大小与 Range 支持（206 + Content-Range） */
async function probeDownload(url: string): Promise<{ size: number; range: boolean }> {
  const head = await fetch(url, { method: 'HEAD' })
  const size = Number(head.headers.get('content-length') ?? 0)
  if (head.headers.get('accept-ranges') === 'bytes') {
    return { size, range: true }
  }
  const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  if (probe.status === 206) {
    const total = Number(
      /bytes \d+-\d+\/(\d+)/.exec(probe.headers.get('content-range') ?? '')?.[1] ?? 0
    )
    return { size: total || size, range: true }
  }
  return { size, range: false }
}

/** 无 Range 支持时单连接顺序下载（不可续传） */
async function downloadWhole(
  task: DownloadTaskInternal,
  url: string,
  controller: AbortController,
  part: string,
  report: () => void
): Promise<void> {
  const response = await fetch(url, { signal: controller.signal })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败：HTTP ${response.status}`)
  }
  if (!task.size) task.size = Number(response.headers.get('content-length') ?? 0)
  const handle = await open(part, 'w')
  try {
    let position = 0
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk)
      await handle.write(buffer, 0, buffer.length, position)
      position += buffer.length
      task.received = position
      report()
    }
  } finally {
    await handle.close()
  }
}

async function downloadChunk(
  url: string,
  handle: Awaited<ReturnType<typeof open>>,
  start: number,
  end: number,
  controller: AbortController
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal
      })
      if (response.status !== 206) {
        throw new Error(`分片请求失败：HTTP ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length !== end - start + 1) {
        throw new Error(`分片长度不符（期望 ${end - start + 1}，实际 ${buffer.length}）`)
      }
      await handle.write(buffer, 0, buffer.length, start)
      return
    } catch (error) {
      if (controller.signal.aborted) throw error
      if (attempt >= MAX_CHUNK_RETRIES) throw error
      await sleep(300 * (attempt + 1))
    }
  }
}

/** 多线程分段下载，支持断点续传（分片状态存于 <file>.part.json） */
async function downloadSegmented(
  task: DownloadTaskInternal,
  url: string,
  controller: AbortController,
  part: string,
  statePath: string,
  report: () => void
): Promise<void> {
  const size = task.size
  const threads = Math.max(1, Math.min(MAX_THREADS, getSettings().downloadThreads || 4))
  // 细粒度分片：至少 1MiB、至多 8MiB，分片总数约为线程数的数倍，保证进度与内存占用可控
  const chunkSize = Math.max(
    MIN_CHUNK_SIZE,
    Math.min(MAX_CHUNK_SIZE, Math.ceil(size / (threads * 4)))
  )
  const totalChunks = Math.ceil(size / chunkSize)

  const completed = new Set<number>()
  if (existsSync(statePath) && existsSync(part)) {
    try {
      const saved = JSON.parse(readFileSync(statePath, 'utf-8')) as DownloadStateFile
      if (saved.fileId === task.fileId && saved.size === size && saved.chunkSize === chunkSize) {
        for (const index of saved.completed) {
          if (Number.isInteger(index) && index >= 0 && index < totalChunks) completed.add(index)
        }
      }
    } catch {
      /* 状态文件损坏则重新下载 */
    }
  }

  const chunkLength = (index: number): number => Math.min(chunkSize, size - index * chunkSize)
  task.received = [...completed].reduce((sum, index) => sum + chunkLength(index), 0)

  let handle: Awaited<ReturnType<typeof open>>
  if (completed.size > 0 && existsSync(part)) {
    try {
      handle = await open(part, 'r+')
    } catch {
      completed.clear()
      task.received = 0
      handle = await open(part, 'w')
    }
  } else {
    handle = await open(part, 'w')
  }

  const persist = (): void => {
    writeFileSync(
      statePath,
      JSON.stringify({
        fileId: task.fileId,
        size,
        chunkSize,
        completed: [...completed].sort((a, b) => a - b)
      })
    )
  }
  if (completed.size > 0) persist()

  const pending = Array.from({ length: totalChunks }, (_, index) => index).filter(
    (index) => !completed.has(index)
  )
  let cursor = 0
  let sincePersist = 0
  let lastPersist = Date.now()

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = pending[cursor++]
      if (index === undefined) return
      const start = index * chunkSize
      const end = start + chunkLength(index) - 1
      await downloadChunk(url, handle, start, end, controller)
      completed.add(index)
      task.received += chunkLength(index)
      sincePersist++
      const now = Date.now()
      if (sincePersist >= 4 || now - lastPersist > 1000) {
        sincePersist = 0
        lastPersist = now
        persist()
      }
      report()
    }
  }

  try {
    const concurrency = Math.max(1, Math.min(threads, pending.length))
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
  } finally {
    persist()
    await handle.close()
  }
}

async function runDownload(task: DownloadTaskInternal, url: string): Promise<void> {
  const controller = new AbortController()
  task.controller = controller
  task.resumable = false
  aborters.set(task.id, controller)
  const { part, state } = partPaths(task.path)
  let lastEmit = 0
  const report = (): void => {
    const now = Date.now()
    if (now - lastEmit > 300) {
      lastEmit = now
      emitProgress(task)
      emitTask(task)
    }
  }

  try {
    mkdirSync(dirname(task.path), { recursive: true })
    const probe = await probeDownload(url)
    task.size = probe.size

    if (!probe.range || probe.size <= 0) {
      await downloadWhole(task, url, controller, part, report)
    } else {
      await downloadSegmented(task, url, controller, part, state, report)
    }

    renameSync(part, task.path)
    rmSync(state, { force: true })
    task.received = task.size
    task.status = 'completed'
    task.finishedAt = Date.now()
  } catch (error) {
    task.status = controller.signal.aborted ? 'canceled' : 'failed'
    if (controller.signal.aborted) {
      delete task.error
    } else {
      task.error = String((error as Error).message || error)
    }
    task.resumable = existsSync(state) && existsSync(part)
    // 无可续传状态时清理半成品
    if (!task.resumable && existsSync(part)) rmSync(part, { force: true })
  } finally {
    aborters.delete(task.id)
    task.finishedAt = task.finishedAt ?? Date.now()
    emitProgress(task)
    emitTask(task)
  }
}

// ---------- 可续传上传 ----------

interface UploadTaskInternal extends UploadTask {
  controller?: AbortController
  etag?: string
  parentFolderId?: number
}

interface UploadStateEntry {
  filePath: string
  name: string
  size: number
  etag: string
  parentFolderId: number
  session: IUploadSession
  completedParts: number[]
  savedAt: number
}

const uploadTasks = new Map<string, UploadTaskInternal>()
const uploadAborters = new Map<string, AbortController>()

function uploadStatePath(): string {
  return join(app.getPath('userData'), 'upload-state.json')
}

function loadUploadStates(): Record<string, UploadStateEntry> {
  try {
    return JSON.parse(readFileSync(uploadStatePath(), 'utf-8')) as Record<string, UploadStateEntry>
  } catch {
    return {}
  }
}

function clearUploadState(key: string): void {
  if (!key) return
  const states = loadUploadStates()
  if (states[key]) {
    delete states[key]
    writeFileSync(uploadStatePath(), JSON.stringify(states))
  }
}

function emitUploadTask(task: UploadTaskInternal): void {
  const serialized: UploadTask = {
    id: task.id,
    name: task.name,
    path: task.path,
    size: task.size,
    received: task.received,
    status: task.status,
    ...(task.error && { error: task.error }),
    ...(task.resumable && { resumable: true }),
    startedAt: task.startedAt,
    ...(task.finishedAt !== undefined && { finishedAt: task.finishedAt })
  }
  broadcast('drive:upload-updated', serialized)
}

function emitUploadProgress(task: UploadTaskInternal): void {
  const progress: UploadProgress = {
    name: task.name,
    received: task.received,
    total: task.size
  }
  broadcast('drive:upload-progress', progress)
}

/** 上传（支持断点续传）：会话与已传分片持久化到 upload-state.json */
async function runUpload(task: UploadTaskInternal, parentFolderId: number): Promise<void> {
  const sdk = getSdk()
  const controller = new AbortController()
  task.controller = controller
  task.parentFolderId = parentFolderId
  task.resumable = false
  uploadAborters.set(task.id, controller)
  let lastEmit = 0
  const report = (): void => {
    const now = Date.now()
    if (now - lastEmit > 300) {
      lastEmit = now
      emitUploadProgress(task)
      emitUploadTask(task)
    }
  }

  let stateKey = ''
  let currentSession: IUploadSession | null = null
  const completedParts: number[] = []

  try {
    if (!sdk) throw new Error('未登录或登录已过期，请重新登录')
    // 超大文件按分片流式上传：仅读取文件大小与流式 MD5，不将整文件读入内存
    const size = await getFilePathSize(task.path)
    task.size = size
    const etag = task.etag ?? (await calculateFileMD5(task.path))
    task.etag = etag
    stateKey = `${etag}:${size}`

    const saved = loadUploadStates()[stateKey]
    const canResume =
      !!saved &&
      saved.name === task.name &&
      saved.size === size &&
      saved.parentFolderId === parentFolderId &&
      Date.now() - saved.savedAt < 24 * 3600 * 1000
    if (canResume && saved) {
      currentSession = saved.session
      completedParts.push(...saved.completedParts)
      task.resumable = true
    }

    const persist = (): void => {
      if (!currentSession) return
      const states = loadUploadStates()
      states[stateKey] = {
        filePath: task.path,
        name: task.name,
        size,
        etag,
        parentFolderId,
        session: currentSession,
        completedParts: [...completedParts].sort((a, b) => a - b),
        savedAt: Date.now()
      }
      writeFileSync(uploadStatePath(), JSON.stringify(states))
    }

    const result = await sdk.file.upload.uploadFile({
      filename: task.name,
      filePath: task.path,
      parentFileID: parentFolderId,
      duplicate: 1,
      signal: controller.signal,
      ...(canResume && saved
        ? { resumeSession: saved.session, completedParts: saved.completedParts }
        : {}),
      onProgress: (progress) => {
        task.size = progress.total || size
        task.received = progress.loaded
        report()
      },
      onSession: (session) => {
        currentSession = session
        persist()
      },
      onPartComplete: (partNumber) => {
        if (!completedParts.includes(partNumber)) completedParts.push(partNumber)
        persist()
      }
    })

    if (!result.fileID) throw new Error('上传失败：未获取到文件 ID')
    clearUploadState(stateKey)
    task.size = size
    task.received = size
    task.status = 'completed'
    task.resumable = false
    delete task.error
    task.finishedAt = Date.now()
  } catch (error) {
    const aborted = controller.signal.aborted
    task.status = aborted ? 'canceled' : 'failed'
    if (aborted) {
      delete task.error
    } else {
      task.error = String((error as Error).message || error)
      // 4xx 多为会话失效，清除状态以便下次从头开始
      if (/status code 4\d\d/.test(task.error)) clearUploadState(stateKey)
    }
    task.resumable = !!loadUploadStates()[stateKey]?.session
  } finally {
    uploadAborters.delete(task.id)
    task.finishedAt = task.finishedAt ?? Date.now()
    emitUploadProgress(task)
    emitUploadTask(task)
  }
}
