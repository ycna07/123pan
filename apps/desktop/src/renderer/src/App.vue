<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AuthStatus, DriveItem, StorageUsage } from '@123pan/shared-types'
import { formatSize } from '@renderer/utils/format'
import { useAppColorMode } from '@renderer/utils/theme'
import FileTable from '@renderer/components/drive/FileTable.vue'
import DownloadManager from '@renderer/components/drive/DownloadManager.vue'
import TrashView from '@renderer/components/drive/TrashView.vue'

const toast = useToast()

const { isDark, preference, setMode: setColorMode, toggle: toggleColorMode } = useAppColorMode()

const COPY_FEEDBACK_DURATION = 1500
function notifyCopied(title: string, options: { icon?: string; description?: string } = {}): void {
  toast.add({
    title,
    icon: options.icon ?? 'i-lucide-copy',
    ...(options.description ? { description: options.description } : {}),
    duration: COPY_FEEDBACK_DURATION
  })
}

const authed = ref<boolean | null>(null)
const account = ref('')
const nickname = ref('')
const avatar = ref('')
const search = ref('')
const items = ref<DriveItem[]>([])
const loading = ref(false)
const usage = ref<StorageUsage | null>(null)
const activeView = ref<'files' | 'downloads' | 'trash'>('files')

const SIDEBAR_DEFAULT_WIDTH = 240
const SIDEBAR_MIN_WIDTH = 160
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_WIDTH_KEY = '123pan-sidebar-width'

function loadSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH
    ? stored
    : SIDEBAR_DEFAULT_WIDTH
}

const sidebarWidth = ref(loadSidebarWidth())
const sidebarResizing = ref(false)

function startSidebarResize(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  sidebarResizing.value = true

  const onMove = (moveEvent: PointerEvent): void => {
    const next = startWidth + (moveEvent.clientX - startX)
    sidebarWidth.value = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next))
  }
  const onUp = (): void => {
    sidebarResizing.value = false
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function resetSidebarWidth(): void {
  sidebarWidth.value = SIDEBAR_DEFAULT_WIDTH
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH))
}

const viewTitle = computed(
  () =>
    ({
      files: '全部文件',
      downloads: '传输管理',
      trash: '回收站'
    })[activeView.value]
)
/** 进行中的下载（任务 id -> 状态），驱动顶部细进度条 */
const activeDownloads = ref(new Map<string, { name: string; percent: number }>())

function updateDownloadProgress(progress: {
  id: string
  name: string
  received: number
  total: number
}): void {
  const percent = progress.total > 0 ? Math.min(100, (progress.received / progress.total) * 100) : 0
  activeDownloads.value.set(progress.id, { name: progress.name, percent })
  if (percent >= 100 || progress.total === 0) {
    setTimeout(() => activeDownloads.value.delete(progress.id), 1500)
  }
}

/** 进行中的上传（文件名 -> 百分比） */
const activeUploads = ref(new Map<string, number>())

function updateUploadProgress(progress: { name: string; received: number; total: number }): void {
  const percent = progress.total > 0 ? Math.min(100, (progress.received / progress.total) * 100) : 0
  activeUploads.value.set(progress.name, percent)
  if (percent >= 100) {
    setTimeout(() => activeUploads.value.delete(progress.name), 1500)
  }
}

/** 剪贴板：剪切/复制待粘贴的文件 id 集合 */
const clipboard = ref<{ op: 'copy' | 'cut'; ids: string[] } | null>(null)
/** FileTable 当前浏览的文件夹（粘贴目标） */
const currentFolderId = ref<string | null>(null)
const selectedIds = ref<string[]>([])

/** 已加载过内容的文件夹 key（'' 表示根目录），用于刷新与去重 */
const loadedFolderKeys = new Set<string>()
const loadingFolderKeys = new Set<string>()

const navItems = computed(() => [
  {
    label: '全部文件',
    icon: 'i-lucide-folder',
    active: activeView.value === 'files',
    onSelect: () => {
      activeView.value = 'files'
    }
  },
  {
    label: '传输管理',
    icon: 'i-lucide-arrow-down-up',
    badge: activeDownloads.value.size > 0 ? String(activeDownloads.value.size) : undefined,
    onSelect: () => {
      activeView.value = 'downloads'
    }
  },
  {
    label: '我的分享',
    icon: 'i-lucide-link-2',
    onSelect: () => toast.add({ title: '我的分享（开发中）', color: 'info' })
  },
  {
    label: '回收站',
    icon: 'i-lucide-trash-2',
    active: activeView.value === 'trash',
    onSelect: () => {
      activeView.value = 'trash'
    }
  }
])

const userMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: '外观',
    icon: 'i-lucide-palette',
    children: [
      {
        label: '浅色',
        type: 'checkbox',
        checked: preference.value === 'light',
        onSelect: () => setColorMode('light')
      },
      {
        label: '深色',
        type: 'checkbox',
        checked: preference.value === 'dark',
        onSelect: () => setColorMode('dark')
      },
      {
        label: '跟随系统',
        type: 'checkbox',
        checked: preference.value === 'auto',
        onSelect: () => setColorMode('auto')
      }
    ]
  },
  {
    label: '退出登录',
    icon: 'i-lucide-log-out',
    onSelect: async () => {
      await window.api.logout()
      account.value = ''
      nickname.value = ''
      avatar.value = ''
      items.value = []
      usage.value = null
      loadedFolderKeys.clear()
      authed.value = false
    }
  }
])

function applyAuthStatus(status: AuthStatus): void {
  account.value = status.account ?? ''
  nickname.value = status.nickname ?? ''
  avatar.value = status.avatar ?? ''
  authed.value = status.authenticated
}

/** 去掉 Electron IPC 包装（Error invoking remote method '...': Error: xxx），只保留业务消息 */
function readableError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '').trim()
  return cleaned || fallback
}

function showError(error: unknown, fallback: string): void {
  toast.add({
    title: readableError(error, fallback),
    color: 'error',
    icon: 'i-lucide-triangle-alert'
  })
}

async function loadFolder(folderId: string | null): Promise<void> {
  const key = folderId ?? ''
  if (loadingFolderKeys.has(key)) return
  loadingFolderKeys.add(key)
  loading.value = true
  try {
    const remote = await window.api.listFiles(folderId)
    const known = new Set(items.value.map((item) => item.id))
    items.value.push(...remote.filter((item) => !known.has(item.id)))
    loadedFolderKeys.add(key)
    void loadFolderSizes(remote)
  } catch (error) {
    showError(error, '加载文件列表失败')
  } finally {
    loadingFolderKeys.delete(key)
    loading.value = loadingFolderKeys.size > 0
  }
}

async function refreshLoadedFolders(): Promise<void> {
  const keys = [...loadedFolderKeys]
  items.value = items.value.filter((item) => !loadedFolderKeys.has(item.parentId ?? ''))
  loadedFolderKeys.clear()
  await Promise.all(keys.map((key) => loadFolder(key === '' ? null : key)))
}

/** 只重载单个文件夹（复制后目标目录会出现新 id 的副本） */
async function reloadFolder(folderId: string | null): Promise<void> {
  const key = folderId ?? ''
  items.value = items.value.filter((item) => (item.parentId ?? '') !== key)
  loadedFolderKeys.delete(key)
  await loadFolder(folderId)
}

/** 目录大小由 /api/file/detail 直接返回，加载列表后异步回填，避免阻塞渲染 */
async function loadFolderSizes(remote: DriveItem[]): Promise<void> {
  const folderIds = remote.filter((item) => item.type === 'folder').map((item) => item.id)
  if (folderIds.length === 0) return
  try {
    const sizes = await window.api.folderSizes(folderIds)
    const hasUpdate = items.value.some(
      (item) => item.type === 'folder' && sizes[item.id] !== undefined
    )
    if (!hasUpdate) return
    items.value = items.value.map((item) =>
      item.type === 'folder' && sizes[item.id] !== undefined
        ? { ...item, size: sizes[item.id] }
        : item
    )
  } catch {
    // 忽略目录大小获取失败，大小列继续显示为 '-'
  }
}

function copySelected(cut: boolean): void {
  if (selectedIds.value.length === 0) {
    toast.add({
      title: cut ? '请先勾选要剪切的文件' : '请先勾选要复制的文件',
      color: 'info',
      icon: 'i-lucide-info'
    })
    return
  }
  clipboard.value = { op: cut ? 'cut' : 'copy', ids: [...selectedIds.value] }
  toast.add({
    title: cut
      ? `已剪切 ${selectedIds.value.length} 项，Ctrl+V 粘贴到当前文件夹`
      : `已复制 ${selectedIds.value.length} 项，Ctrl+V 粘贴到当前文件夹`,
    icon: cut ? 'i-lucide-scissors' : 'i-lucide-copy'
  })
}

async function pasteClipboard(targetOverride?: string): Promise<void> {
  const clip = clipboard.value
  if (!clip || clip.ids.length === 0) {
    toast.add({ title: '剪贴板为空', color: 'info', icon: 'i-lucide-info' })
    return
  }
  const targetId = targetOverride ?? currentFolderId.value
  const ids = [...clip.ids] // 剪贴板是响应式代理，跨 IPC 必须先解包为纯数组
  const inSameFolder = ids.every((id) => {
    const item = items.value.find((entry) => entry.id === id)
    return item && (item.parentId ?? null) === targetId
  })
  if (inSameFolder) {
    toast.add({
      title: '文件已在当前文件夹中，请进入其他文件夹后粘贴',
      color: 'info',
      icon: 'i-lucide-info'
    })
    return
  }
  try {
    if (clip.op === 'cut') {
      await window.api.moveFiles(ids, targetId)
      for (const item of items.value) {
        if (ids.includes(item.id)) item.parentId = targetId
      }
      toast.add({ title: `已移动 ${ids.length} 项`, icon: 'i-lucide-folder-input' })
    } else {
      await window.api.copyFiles(ids, targetId)
      await reloadFolder(targetId)
      toast.add({ title: `已粘贴 ${ids.length} 项`, icon: 'i-lucide-copy-check' })
    }
    clipboard.value = null
  } catch (error) {
    showError(error, clip.op === 'cut' ? '移动文件失败' : '复制文件失败')
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }
  const key = event.key.toLowerCase()
  if (key === 'c') {
    event.preventDefault()
    copySelected(false)
  } else if (key === 'x') {
    event.preventDefault()
    copySelected(true)
  } else if (key === 'v') {
    event.preventDefault()
    void pasteClipboard()
  }
}

function handleOpenFolder(folderId: string): void {
  void loadFolder(folderId)
}

function loadUsage(): void {
  void window.api
    .getUsage()
    .then((data) => {
      usage.value = data
    })
    .catch(() => {
      /* 侧边栏非关键信息，静默失败 */
    })
}

function handleFolderChange(folderId: string | null): void {
  currentFolderId.value = folderId
}

function handleSelectionChange(ids: string[]): void {
  selectedIds.value = ids
}

function handleClipboardOperation(op: 'copy' | 'cut', ids: string[]): void {
  selectedIds.value = ids
  copySelected(op === 'cut')
}

async function handleDelete(item: DriveItem): Promise<void> {
  try {
    await window.api.deleteFiles([item.id])
    items.value = items.value.filter((entry) => entry.id !== item.id)
    toast.add({
      title: `「${item.name}」已移入回收站`,
      description: '可在侧边栏「回收站」中恢复或彻底删除',
      icon: 'i-lucide-trash-2'
    })
  } catch (error) {
    showError(error, '删除文件失败')
  }
}

function handlePaste(targetFolderId: string): void {
  void pasteClipboard(targetFolderId)
}

const currentFolderName = computed(() => {
  if (!currentFolderId.value) return '全部文件'
  return items.value.find((i) => i.id === currentFolderId.value)?.name ?? '全部文件'
})

async function handleDownload(item: DriveItem): Promise<void> {
  try {
    const result = (await window.api.downloadFile(item.id, item.name)) as {
      canceled: boolean
      id?: string
    }
    if (result?.canceled) return
    toast.add({
      title: `「${item.name}」已加入下载队列`,
      description: '可在侧边栏「下载管理」查看进度',
      icon: 'i-lucide-download'
    })
  } catch (error) {
    showError(error, '下载文件失败')
  }
}

const uploadInput = ref<HTMLInputElement | null>(null)

function pickUploads(): void {
  uploadInput.value?.click()
}

async function handleUploadInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) {
    await uploadOne(window.api.getPathForFile(file))
  }
}

async function uploadOne(filePath: string): Promise<void> {
  const name = filePath.split(/[\\/]/).pop() ?? filePath
  try {
    await window.api.uploadFile(filePath, currentFolderId.value)
    toast.add({
      title: `「${name}」已加入上传队列`,
      description: '可在侧边栏「传输管理」查看进度',
      icon: 'i-lucide-cloud-upload'
    })
  } catch (error) {
    showError(error, `上传「${name}」失败`)
    activeUploads.value.delete(name)
  }
}

function handleUploadDropped(paths: string[]): void {
  for (const path of paths) void uploadOne(path)
}

const newFolderOpen = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)

function openNewFolder(): void {
  newFolderName.value = ''
  newFolderOpen.value = true
}

async function confirmNewFolder(): Promise<void> {
  const name = newFolderName.value.trim()
  if (!name) return
  creatingFolder.value = true
  try {
    await window.api.createFolder(currentFolderId.value, name)
    newFolderOpen.value = false
    toast.add({ title: `文件夹「${name}」已创建`, icon: 'i-lucide-folder-plus' })
    await reloadFolder(currentFolderId.value)
  } catch (error) {
    showError(error, '新建文件夹失败')
  } finally {
    creatingFolder.value = false
  }
}

const offlineOpen = ref(false)
const offlineUrl = ref('')
const creatingOffline = ref(false)

function openOffline(): void {
  offlineUrl.value = ''
  offlineOpen.value = true
}

async function confirmOffline(): Promise<void> {
  const url = offlineUrl.value.trim()
  if (!url) return
  creatingOffline.value = true
  try {
    await window.api.createOfflineTask(url, currentFolderId.value)
    offlineOpen.value = false
    toast.add({
      title: '离线下载任务已创建',
      description: '可在 123pan 服务端任务列表中查看进度',
      icon: 'i-lucide-cloud-download'
    })
  } catch (error) {
    showError(error, '创建离线下载任务失败')
  } finally {
    creatingOffline.value = false
  }
}

const shareOpen = ref(false)
const shareItems = ref<DriveItem[]>([])
const shareName = ref('')
const shareExpire = ref<0 | 1 | 7 | 30>(7)
const sharePwd = ref('')
const creatingShare = ref(false)
const shareResult = ref<{ url: string; shareKey: string; sharePwd?: string } | null>(null)
const shareExpireOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永久', value: 0 }
]

function handleShare(items: DriveItem[]): void {
  if (items.length === 0) return
  shareItems.value = items
  const base = items.length === 1 ? items[0].name : `${items[0].name} 等 ${items.length} 项`
  shareName.value = base.slice(0, 30)
  shareExpire.value = 7
  sharePwd.value = ''
  shareResult.value = null
  shareOpen.value = true
}

function generateSharePwd(): void {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  sharePwd.value = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

async function confirmShare(): Promise<void> {
  if (shareItems.value.length === 0 || creatingShare.value) return
  creatingShare.value = true
  try {
    const result = await window.api.createShare(
      shareItems.value.map((item) => item.id),
      shareName.value.trim() || shareItems.value[0].name,
      shareExpire.value,
      sharePwd.value.trim() || undefined
    )
    shareResult.value = result
  } catch (error) {
    showError(error, '创建分享失败')
  } finally {
    creatingShare.value = false
  }
}

async function copyShareResult(): Promise<void> {
  if (!shareResult.value) return
  await window.api.copyText(shareResult.value.url)
  notifyCopied('链接已复制')
}

function closeShareDialog(): void {
  shareOpen.value = false
  shareResult.value = null
}

const openShareOpen = ref(false)
const openShareLink = ref('')
const openShareLoading = ref(false)
const openShareError = ref('')
const openShareResult = ref<{
  shareKey: string
  sharePwd?: string
  items: DriveItem[]
} | null>(null)
const openSharePath = ref<Array<{ id: string; name: string }>>([])
const openShareSelected = ref<Record<string, boolean>>({})

const openShareSelectedIds = computed(() =>
  Object.entries(openShareSelected.value)
    .filter(([, selected]) => selected)
    .map(([id]) => id)
)
const openShareAllSelected = computed(() => {
  const items = openShareResult.value?.items ?? []
  return items.length > 0 && items.every((item) => openShareSelected.value[item.id])
})
const openShareSomeSelected = computed(() => {
  const items = openShareResult.value?.items ?? []
  return items.some((item) => openShareSelected.value[item.id]) && !openShareAllSelected.value
})

function resetOpenShare(): void {
  openShareLink.value = ''
  openShareResult.value = null
  openShareError.value = ''
  openSharePath.value = []
  openShareSelected.value = {}
}

function openShareDialog(): void {
  resetOpenShare()
  openShareOpen.value = true
}

async function parseShare(parentFolderId?: string | null): Promise<void> {
  const link = openShareLink.value.trim()
  if (!link || openShareLoading.value) return
  openShareLoading.value = true
  openShareError.value = ''
  try {
    const result = (await window.api.parseShare(link, parentFolderId ?? null)) as {
      shareKey: string
      sharePwd?: string
      items: DriveItem[]
    }
    openShareResult.value = result
    openShareSelected.value = {}
  } catch (error) {
    openShareResult.value = null
    openShareError.value = readableError(error, '解析分享链接失败')
  } finally {
    openShareLoading.value = false
  }
}

function startParseShare(): void {
  openSharePath.value = []
  void parseShare(null)
}

async function openShareFolder(item: DriveItem): Promise<void> {
  openSharePath.value = [...openSharePath.value, { id: item.id, name: item.name }]
  await parseShare(item.id)
}

async function goSharePath(index: number): Promise<void> {
  openSharePath.value = openSharePath.value.slice(0, index + 1)
  await parseShare(openSharePath.value.at(-1)?.id ?? null)
}

function toggleAllShareItems(value: boolean): void {
  const items = openShareResult.value?.items ?? []
  openShareSelected.value = value ? Object.fromEntries(items.map((item) => [item.id, true])) : {}
}

function toggleShareItem(id: string, value: boolean): void {
  openShareSelected.value = { ...openShareSelected.value, [id]: value }
}

async function copyParsedShareLink(): Promise<void> {
  const link = openShareLink.value.trim()
  if (!link) return
  await window.api.copyText(link)
  notifyCopied('分享链接已复制')
}

async function transferParsedShare(fileIds?: string[]): Promise<void> {
  const link = openShareLink.value.trim()
  if (!link) return
  try {
    const parent = openSharePath.value.at(-1)?.id ?? null
    const result = await window.api.transferShare(link, currentFolderId.value, parent, fileIds)
    toast.add({
      title: `已转存 ${result.count} 项到「${currentFolderName.value}」`,
      icon: 'i-lucide-folder-input'
    })
    openShareOpen.value = false
    resetOpenShare()
    await reloadFolder(currentFolderId.value)
  } catch (error) {
    openShareError.value = readableError(error, '转存失败')
  }
}

async function downloadParsedShare(item: DriveItem): Promise<void> {
  const link = openShareLink.value.trim()
  if (!link) return
  try {
    const result = (await window.api.downloadShared(link, item.id, item.name)) as {
      canceled: boolean
    }
    if (result?.canceled) return
    toast.add({
      title: `「${item.name}」已加入下载队列`,
      description: '可在侧边栏「传输管理」查看进度',
      icon: 'i-lucide-download'
    })
  } catch (error) {
    showError(error, '下载分享文件失败')
  }
}

const reuseOpen = ref(false)
const reuseText = ref('')
const reuseRunning = ref(false)
const reuseProgress = ref<{ done: number; total: number; current: string; ok: boolean } | null>(
  null
)
let removeReuseProgress: (() => void) | null = null
let removeUploadUpdated: (() => void) | null = null

function openReuse(): void {
  reuseText.value = ''
  reuseProgress.value = null
  reuseOpen.value = true
}

async function handleExportReuse(item: DriveItem): Promise<void> {
  try {
    if (item.type === 'folder') {
      toast.add({
        title: `正在生成「${item.name}」的秒传 JSON…`,
        description: '目录较大时需要一些时间',
        color: 'info',
        icon: 'i-lucide-loader-circle'
      })
    }
    const result = (await window.api.exportReuse([item.id])) as {
      count: number
      skipped: number
    }
    notifyCopied(`秒传 JSON 已复制（${result.count} 个文件）`, {
      icon: 'i-lucide-file-json',
      description: `${
        result.skipped ? `跳过 ${result.skipped} 个缺少 MD5 的条目；` : ''
      }可粘贴到「JSON 秒传」或分享给他人`
    })
  } catch (error) {
    showError(error, '生成秒传 JSON 失败')
  }
}

async function confirmReuse(): Promise<void> {
  const text = reuseText.value.trim()
  if (!text || reuseRunning.value) return
  reuseRunning.value = true
  reuseProgress.value = null
  try {
    const result = (await window.api.reuseSave(currentFolderId.value, text)) as {
      total: number
      createdDirs: number
      savedCount: number
      failed: Array<{ name: string; error: string }>
    }
    reuseOpen.value = false
    toast.add({
      title: `秒传完成：成功 ${result.savedCount} / ${result.total}`,
      description: `新建目录 ${result.createdDirs} 个${
        result.failed.length
          ? `；失败 ${result.failed.length} 项（${result.failed[0].name}：${result.failed[0].error}）`
          : ''
      }`,
      color: result.failed.length ? 'warning' : 'success',
      icon: 'i-lucide-sparkles'
    })
    await reloadFolder(currentFolderId.value)
  } catch (error) {
    showError(error, '秒传失败')
  } finally {
    reuseRunning.value = false
  }
}

async function handleCopyLink(item: DriveItem): Promise<void> {
  try {
    await window.api.copyDownloadLink(item.id)
    notifyCopied(`「${item.name}」直链已复制到剪贴板`, { icon: 'i-lucide-link' })
  } catch (error) {
    showError(error, '获取下载直链失败')
  }
}

async function handleMove(id: string, targetId: string | null): Promise<void> {
  const item = items.value.find((entry) => entry.id === id)
  if (!item || item.parentId === targetId) return
  try {
    await window.api.moveFiles([id], targetId)
    item.parentId = targetId
    const targetName = targetId
      ? (items.value.find((entry) => entry.id === targetId)?.name ?? '全部文件')
      : '全部文件'
    toast.add({ title: `已移动「${item.name}」至「${targetName}」`, icon: 'i-lucide-folder-input' })
  } catch (error) {
    showError(error, '移动文件失败')
  }
}

function handleAuthenticated(status: AuthStatus): void {
  applyAuthStatus(status)
  const displayName = status.nickname || status.account || '用户'
  toast.add({ title: `欢迎回来，${displayName}`, icon: 'i-lucide-party-popper' })
  void loadFolder(null)
  loadUsage()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  const removeDownloadProgress = window.api.onDownloadProgress(updateDownloadProgress)
  const removeUploadProgress = window.api.onUploadProgress(updateUploadProgress)
  removeReuseProgress = window.api.onReuseProgress((progress) => {
    reuseProgress.value = progress
  })
  removeUploadUpdated = window.api.onUploadUpdated((task) => {
    if (task.status === 'uploading') return
    activeUploads.value.delete(task.name)
    if (task.status === 'completed') {
      toast.add({ title: `「${task.name}」上传完成`, icon: 'i-lucide-cloud-upload' })
      void reloadFolder(currentFolderId.value)
    } else if (task.status === 'failed') {
      showError(new Error(task.error || '上传失败'), `上传「${task.name}」失败`)
    }
  })
  window.api.onLoginSuccess((status) => {
    applyAuthStatus(status)
    const displayName = status.nickname || status.account || '用户'
    toast.add({ title: `欢迎回来，${displayName}`, icon: 'i-lucide-party-popper' })
    void loadFolder(null)
    loadUsage()
  })
  try {
    applyAuthStatus(await window.api.getAuthStatus())
  } catch {
    authed.value = false
  }
  if (authed.value) {
    void loadFolder(null)
    loadUsage()
  }
  onBeforeUnmount(() => {
    removeDownloadProgress()
    removeUploadProgress()
    removeReuseProgress?.()
    removeUploadUpdated?.()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <UApp>
    <LoginForm v-if="authed === false" @authenticated="handleAuthenticated" />

    <div v-else-if="authed === true" class="flex h-screen bg-default text-default">
      <aside
        class="relative hidden shrink-0 flex-col border-r border-default bg-elevated/50 lg:flex"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <div class="flex items-center gap-2 px-4 py-4">
          <UIcon name="i-lucide-cloud" class="size-6 shrink-0 text-primary" />
          <span class="truncate text-base font-semibold text-highlighted">123云盘</span>
        </div>
        <UNavigationMenu :items="navItems" orientation="vertical" class="flex-1 px-2" />
        <div class="border-t border-default px-4 py-4">
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span class="shrink-0">存储空间</span>
            <span class="truncate tabular-nums">
              {{ usage ? `${formatSize(usage.used)} / ${formatSize(usage.permanent)}` : '加载中…' }}
            </span>
          </div>
          <UProgress
            :model-value="usage ? Math.min(100, (usage.used / usage.permanent) * 100) : 0"
            size="sm"
            class="mt-2"
          />
        </div>
        <div
          class="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none"
          :class="sidebarResizing ? 'bg-primary/40' : ''"
          title="拖动调整侧栏宽度，双击恢复默认"
          @pointerdown="startSidebarResize"
          @dblclick="resetSidebarWidth"
        >
          <div
            class="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/60"
          />
        </div>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-3 border-b border-default px-6 py-3">
          <h1 class="text-base font-semibold text-highlighted">{{ viewTitle }}</h1>
          <template v-if="activeView === 'files'">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="搜索文件..."
              size="sm"
              class="ml-auto w-64"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="刷新"
              :loading="loading"
              @click="refreshLoadedFolders"
            />
            <UButton
              icon="i-lucide-link-2"
              size="sm"
              color="neutral"
              variant="outline"
              @click="openShareDialog"
            >
              打开分享
            </UButton>
            <UPopover
              v-model:open="reuseOpen"
              :content="{ align: 'end' }"
              :ui="{ content: 'z-50' }"
            >
              <UButton
                icon="i-lucide-file-json"
                size="sm"
                color="neutral"
                variant="outline"
                @click="openReuse"
              >
                JSON 秒传
              </UButton>
              <template #content>
                <div class="flex w-[480px] flex-col gap-3 p-1">
                  <p class="text-sm font-medium text-highlighted">JSON 秒传</p>
                  <p class="text-xs text-muted">
                    粘贴 123FastLink 导出的秒传 JSON，文件将按目录结构创建到当前文件夹 （{{
                      currentFolderName
                    }}）。仅需文件元数据（MD5/大小/文件名），命中云端即秒传。
                  </p>
                  <UTextarea
                    v-model="reuseText"
                    :rows="7"
                    placeholder='{"files":[{"path":"目录/文件.ext","etag":"...","size":0}],"commonPath":"","usesBase62EtagsInExport":true}'
                    class="w-full font-mono text-xs"
                  />
                  <div v-if="reuseRunning && reuseProgress" class="text-xs text-muted">
                    进度 {{ reuseProgress.done }}/{{ reuseProgress.total }}：
                    <span :class="reuseProgress.ok ? 'text-success' : 'text-error'">
                      {{ reuseProgress.current }}
                    </span>
                  </div>
                  <div class="flex justify-end gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" @click="reuseOpen = false">
                      取消
                    </UButton>
                    <UButton
                      size="sm"
                      icon="i-lucide-sparkles"
                      :loading="reuseRunning"
                      :disabled="!reuseText.trim()"
                      @click="confirmReuse"
                    >
                      开始秒传
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
            <UPopover
              v-model:open="newFolderOpen"
              :content="{ align: 'end' }"
              :ui="{ content: 'z-50' }"
            >
              <UButton
                icon="i-lucide-folder-plus"
                size="sm"
                color="neutral"
                variant="outline"
                @click="openNewFolder"
              >
                新建文件夹
              </UButton>
              <template #content>
                <div class="flex w-72 flex-col gap-3 p-1">
                  <p class="text-sm font-medium text-highlighted">新建文件夹</p>
                  <UInput
                    v-model="newFolderName"
                    placeholder="请输入名称"
                    size="lg"
                    class="w-full"
                    autofocus
                    @keydown.enter="confirmNewFolder"
                  />
                  <div class="flex justify-end gap-2">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="newFolderOpen = false"
                    >
                      取消
                    </UButton>
                    <UButton
                      size="sm"
                      icon="i-lucide-folder-plus"
                      :loading="creatingFolder"
                      :disabled="!newFolderName.trim()"
                      @click="confirmNewFolder"
                    >
                      创建
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
            <UPopover
              v-model:open="offlineOpen"
              :content="{ align: 'end' }"
              :ui="{ content: 'z-50' }"
            >
              <UButton
                icon="i-lucide-cloud-download"
                size="sm"
                color="neutral"
                variant="outline"
                @click="openOffline"
              >
                离线下载
              </UButton>
              <template #content>
                <div class="flex w-96 flex-col gap-3 p-1">
                  <p class="text-sm font-medium text-highlighted">离线下载</p>
                  <UInput
                    v-model="offlineUrl"
                    placeholder="粘贴下载链接（HTTP/磁力链）"
                    size="lg"
                    class="w-full"
                    @keydown.enter="confirmOffline"
                  />
                  <p class="text-xs text-muted">
                    任务将在 123pan 服务端创建并下载到当前文件夹（{{ currentFolderName }}）。
                  </p>
                  <div class="flex justify-end gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" @click="offlineOpen = false">
                      取消
                    </UButton>
                    <UButton
                      size="sm"
                      icon="i-lucide-cloud-download"
                      :loading="creatingOffline"
                      :disabled="!offlineUrl.trim()"
                      @click="confirmOffline"
                    >
                      创建任务
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
            <UButton icon="i-lucide-upload" size="sm" @click="pickUploads">上传文件</UButton>
            <input
              ref="uploadInput"
              type="file"
              multiple
              class="hidden"
              @change="handleUploadInput"
            />
          </template>
          <span v-else class="ml-auto text-xs text-muted">
            {{ activeDownloads.size > 0 ? `${activeDownloads.size} 个下载进行中` : '' }}
          </span>
          <span class="hidden max-w-40 truncate text-sm text-muted md:block">
            {{ nickname || account }}
          </span>
          <UButton
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            size="sm"
            color="neutral"
            variant="ghost"
            :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
            @click="toggleColorMode"
          />
          <UDropdownMenu :items="userMenuItems" :content="{ align: 'end' }">
            <UAvatar
              :src="avatar || undefined"
              icon="i-lucide-user"
              size="sm"
              class="cursor-pointer"
            />
          </UDropdownMenu>
        </header>

        <div
          v-if="activeView === 'files' && activeDownloads.size + activeUploads.size > 0"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-default bg-elevated/50 px-6 py-1.5 text-xs text-muted"
        >
          <template v-for="[name, percent] in [...activeUploads.entries()]" :key="`u-${name}`">
            <UIcon name="i-lucide-cloud-upload" class="size-3.5 shrink-0" />
            <span class="max-w-36 truncate">{{ name }}</span>
            <div class="h-1 w-32 overflow-hidden rounded-full bg-accented">
              <div
                class="h-full bg-primary transition-all"
                :style="{ width: `${Math.max(2, percent)}%` }"
              />
            </div>
            <span class="tabular-nums">{{ Math.round(percent) }}%</span>
          </template>
          <template v-for="[id, dl] in [...activeDownloads.entries()]" :key="id">
            <UIcon name="i-lucide-download" class="size-3.5 shrink-0" />
            <span class="max-w-36 truncate">{{ dl.name }}</span>
            <div class="h-1 w-32 overflow-hidden rounded-full bg-accented">
              <div
                class="h-full bg-primary transition-all"
                :style="{ width: `${Math.max(2, dl.percent)}%` }"
              />
            </div>
            <span class="tabular-nums">{{ Math.round(dl.percent) }}%</span>
          </template>
        </div>

        <div v-if="activeView === 'files'" class="min-h-0 flex-1 p-4">
          <FileTable
            v-model:search="search"
            :items="items"
            :loading="loading"
            :clipboard="clipboard"
            @open-folder="handleOpenFolder"
            @folder-change="handleFolderChange"
            @selection-change="handleSelectionChange"
            @download="handleDownload"
            @copy-link="handleCopyLink"
            @clipboard-operation="handleClipboardOperation"
            @paste="handlePaste"
            @move="handleMove"
            @upload-files="handleUploadDropped"
            @delete="handleDelete"
            @export-reuse="handleExportReuse"
            @share="handleShare"
          />
        </div>
        <div v-else-if="activeView === 'trash'" class="min-h-0 flex-1 overflow-y-auto p-4">
          <TrashView />
        </div>
        <div v-else class="min-h-0 flex-1 overflow-y-auto p-4">
          <DownloadManager />
        </div>
      </main>

      <UModal
        v-model:open="shareOpen"
        @update:open="
          (open: boolean) => {
            if (!open) closeShareDialog()
          }
        "
      >
        <template #content>
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
                <span class="font-medium text-highlighted">
                  {{ shareResult ? '分享已创建' : '创建分享' }}
                </span>
              </div>
            </template>

            <div v-if="shareResult" class="flex flex-col gap-3">
              <p class="text-sm text-muted">链接已复制到剪贴板，也可手动复制：</p>
              <div class="flex items-center gap-2">
                <UInput :model-value="shareResult.url" readonly class="flex-1 font-mono text-xs" />
                <UButton
                  icon="i-lucide-copy"
                  color="neutral"
                  variant="outline"
                  @click="copyShareResult"
                >
                  复制
                </UButton>
              </div>
              <p v-if="shareResult.sharePwd" class="text-xs text-muted">
                提取码：<span class="font-mono text-highlighted">{{ shareResult.sharePwd }}</span>
              </p>
              <p class="text-xs text-muted">
                共 {{ shareItems.length }} 项 ·
                {{ shareExpire === 0 ? '永久有效' : `${shareExpire} 天有效` }}
              </p>
            </div>

            <div v-else class="flex flex-col gap-4">
              <div
                class="rounded-lg border border-default bg-elevated/50 px-3 py-2 text-xs text-muted"
              >
                分享 {{ shareItems.length }} 项：{{
                  shareItems
                    .map((item) => item.name)
                    .join('、')
                    .slice(0, 60)
                }}{{ shareItems.map((item) => item.name).join('、').length > 60 ? '…' : '' }}
              </div>
              <UFormField label="分享名称">
                <UInput
                  v-model="shareName"
                  placeholder="分享名称"
                  size="lg"
                  maxlength="30"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="有效期">
                <USelect
                  v-model="shareExpire"
                  :items="shareExpireOptions"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="提取码（可选）">
                <div class="flex w-full gap-2">
                  <UInput
                    v-model="sharePwd"
                    placeholder="留空则无提取码"
                    size="lg"
                    maxlength="10"
                    class="flex-1"
                  />
                  <UButton
                    icon="i-lucide-dices"
                    color="neutral"
                    variant="outline"
                    size="lg"
                    aria-label="随机生成提取码"
                    @click="generateSharePwd"
                  >
                    随机
                  </UButton>
                </div>
              </UFormField>
            </div>

            <template #footer>
              <div class="flex justify-end gap-2">
                <template v-if="shareResult">
                  <UButton @click="closeShareDialog">完成</UButton>
                </template>
                <template v-else>
                  <UButton color="neutral" variant="ghost" @click="closeShareDialog">取消</UButton>
                  <UButton
                    icon="i-lucide-link-2"
                    :loading="creatingShare"
                    :disabled="shareItems.length === 0"
                    @click="confirmShare"
                  >
                    创建并复制链接
                  </UButton>
                </template>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>

      <UModal v-model:open="openShareOpen" :ui="{ content: 'max-w-2xl' }">
        <template #content>
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
                <span class="font-medium text-highlighted">打开分享链接</span>
              </div>
            </template>

            <div class="flex flex-col gap-4">
              <div class="flex items-end gap-2">
                <UFormField label="分享链接或分享码" class="flex-1">
                  <UInput
                    v-model="openShareLink"
                    placeholder="https://www.123pan.com/s/xxxx?pwd=xxxx 或分享码"
                    size="lg"
                    class="w-full"
                    @keydown.enter="startParseShare"
                  />
                </UFormField>
                <UButton
                  icon="i-lucide-search"
                  size="lg"
                  :loading="openShareLoading"
                  @click="startParseShare"
                >
                  解析
                </UButton>
              </div>

              <UAlert
                v-if="openShareError"
                color="error"
                variant="soft"
                icon="i-lucide-triangle-alert"
                :title="openShareError"
              />

              <div v-if="openShareResult" class="flex flex-col gap-2">
                <div class="flex min-w-0 items-center gap-1 text-xs text-muted">
                  <button
                    type="button"
                    class="shrink-0 rounded px-1 py-0.5 hover:bg-elevated hover:text-highlighted"
                    @click="goSharePath(-1)"
                  >
                    分享根目录
                  </button>
                  <template v-for="(part, index) in openSharePath" :key="part.id">
                    <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-dimmed" />
                    <button
                      type="button"
                      class="max-w-40 truncate rounded px-1 py-0.5 hover:bg-elevated hover:text-highlighted"
                      @click="goSharePath(index)"
                    >
                      {{ part.name }}
                    </button>
                  </template>
                  <UButton
                    class="ml-auto"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-copy"
                    @click="copyParsedShareLink"
                  >
                    复制链接
                  </UButton>
                </div>

                <div class="rounded-lg border border-default">
                  <div
                    class="flex items-center gap-3 border-b border-default px-3 py-2 text-xs text-muted"
                  >
                    <UCheckbox
                      :model-value="openShareAllSelected"
                      :indeterminate="openShareSomeSelected"
                      @update:model-value="
                        (value: boolean | 'indeterminate') => toggleAllShareItems(Boolean(value))
                      "
                    />
                    <span>共 {{ openShareResult.items.length }} 项</span>
                    <span v-if="openShareResult.sharePwd" class="ml-auto">
                      提取码 {{ openShareResult.sharePwd }}
                    </span>
                  </div>
                  <div class="max-h-64 divide-y divide-default overflow-y-auto">
                    <div
                      v-for="item in openShareResult.items"
                      :key="item.id"
                      class="flex items-center gap-3 px-3 py-2"
                    >
                      <UCheckbox
                        :model-value="!!openShareSelected[item.id]"
                        @update:model-value="
                          (value: boolean | 'indeterminate') =>
                            toggleShareItem(item.id, Boolean(value))
                        "
                      />
                      <UIcon
                        :name="item.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file'"
                        class="size-4 shrink-0"
                        :class="item.type === 'folder' ? 'text-primary' : 'text-muted'"
                      />
                      <button
                        v-if="item.type === 'folder'"
                        type="button"
                        class="min-w-0 flex-1 truncate text-left text-sm text-highlighted hover:underline"
                        @click="openShareFolder(item)"
                      >
                        {{ item.name }}
                      </button>
                      <span v-else class="min-w-0 flex-1 truncate text-sm text-highlighted">
                        {{ item.name }}
                      </span>
                      <span class="shrink-0 text-xs text-muted">
                        {{ item.type === 'folder' ? '-' : formatSize(item.size) }}
                      </span>
                      <UButton
                        v-if="item.type === 'folder'"
                        icon="i-lucide-folder-open"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        aria-label="打开文件夹"
                        @click="openShareFolder(item)"
                      />
                      <UButton
                        v-else
                        icon="i-lucide-download"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        aria-label="下载"
                        @click="downloadParsedShare(item)"
                      />
                    </div>
                    <div
                      v-if="openShareResult.items.length === 0"
                      class="px-3 py-6 text-center text-sm text-muted"
                    >
                      此文件夹为空
                    </div>
                  </div>
                </div>
              </div>

              <p v-else-if="!openShareError" class="text-xs text-muted">
                粘贴分享链接后点击「解析」，可浏览分享内容并转存到「{{ currentFolderName }}」。
              </p>
            </div>

            <template #footer>
              <div class="flex w-full justify-end gap-2">
                <UButton color="neutral" variant="ghost" @click="openShareOpen = false"
                  >关闭</UButton
                >
                <UButton
                  icon="i-lucide-folder-input"
                  color="neutral"
                  variant="outline"
                  :disabled="openShareSelectedIds.length === 0"
                  @click="transferParsedShare(openShareSelectedIds)"
                >
                  转存选中{{
                    openShareSelectedIds.length ? `（${openShareSelectedIds.length}）` : ''
                  }}
                </UButton>
                <UButton
                  icon="i-lucide-folder-input"
                  :disabled="!openShareResult || openShareResult.items.length === 0"
                  @click="transferParsedShare()"
                >
                  全部转存
                </UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
    </div>

    <div v-else class="flex h-screen items-center justify-center bg-default">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
  </UApp>
</template>
