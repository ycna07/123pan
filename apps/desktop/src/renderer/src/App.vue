<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { AuthStatus, DriveItem } from '@123pan/shared-types'
import FileTable from '@renderer/components/drive/FileTable.vue'

const toast = useToast()

const authed = ref<boolean | null>(null)
const account = ref('')
const nickname = ref('')
const avatar = ref('')
const search = ref('')
const items = ref<DriveItem[]>([])
const loading = ref(false)

/** 剪贴板：剪切/复制待粘贴的文件 id 集合 */
const clipboard = ref<{ op: 'copy' | 'cut'; ids: string[] } | null>(null)
/** FileTable 当前浏览的文件夹（粘贴目标） */
const currentFolderId = ref<string | null>(null)
const selectedIds = ref<string[]>([])

/** 已加载过内容的文件夹 key（'' 表示根目录），用于刷新与去重 */
const loadedFolderKeys = new Set<string>()
const loadingFolderKeys = new Set<string>()

const navItems = [
  { label: '全部文件', icon: 'i-lucide-folder', active: true },
  {
    label: '我的分享',
    icon: 'i-lucide-link-2',
    onSelect: () => toast.add({ title: '我的分享（开发中）', color: 'info' })
  },
  {
    label: '回收站',
    icon: 'i-lucide-trash-2',
    onSelect: () => toast.add({ title: '回收站（开发中）', color: 'info' })
  }
]

const userMenuItems = [
  {
    label: '退出登录',
    icon: 'i-lucide-log-out',
    onSelect: async () => {
      await window.api.logout()
      account.value = ''
      nickname.value = ''
      avatar.value = ''
      items.value = []
      loadedFolderKeys.clear()
      authed.value = false
    }
  }
]

function applyAuthStatus(status: AuthStatus): void {
  account.value = status.account ?? ''
  nickname.value = status.nickname ?? ''
  avatar.value = status.avatar ?? ''
  authed.value = status.authenticated
}

function showError(error: unknown, fallback: string): void {
  toast.add({
    title: error instanceof Error ? error.message : fallback,
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

async function pasteClipboard(): Promise<void> {
  const clip = clipboard.value
  if (!clip || clip.ids.length === 0) {
    toast.add({ title: '剪贴板为空', color: 'info', icon: 'i-lucide-info' })
    return
  }
  const targetId = currentFolderId.value
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

function handleFolderChange(folderId: string | null): void {
  currentFolderId.value = folderId
}

function handleSelectionChange(ids: string[]): void {
  selectedIds.value = ids
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
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.api.onLoginSuccess((status) => {
    applyAuthStatus(status)
    const displayName = status.nickname || status.account || '用户'
    toast.add({ title: `欢迎回来，${displayName}`, icon: 'i-lucide-party-popper' })
    void loadFolder(null)
  })
  try {
    applyAuthStatus(await window.api.getAuthStatus())
  } catch {
    authed.value = false
  }
  if (authed.value) void loadFolder(null)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function handleUpload(): void {
  toast.add({
    title: '上传功能开发中',
    description: '文件显示部分已完成，上传流程即将接入',
    icon: 'i-lucide-upload'
  })
}
</script>

<template>
  <UApp>
    <LoginForm v-if="authed === false" @authenticated="handleAuthenticated" />

    <div v-else-if="authed === true" class="flex h-screen bg-default text-default">
      <aside class="hidden w-60 shrink-0 flex-col border-r border-default bg-elevated/50 lg:flex">
        <div class="flex items-center gap-2 px-4 py-4">
          <UIcon name="i-lucide-cloud" class="size-6 text-primary" />
          <span class="text-base font-semibold text-highlighted">123云盘</span>
        </div>
        <UNavigationMenu :items="navItems" orientation="vertical" class="flex-1 px-2" />
        <div class="border-t border-default px-4 py-4">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>存储空间</span>
            <span class="tabular-nums">12.6 GB / 100 GB</span>
          </div>
          <UProgress :model-value="12.6" size="sm" class="mt-2" />
        </div>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-3 border-b border-default px-6 py-3">
          <h1 class="text-base font-semibold text-highlighted">全部文件</h1>
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
          <UButton icon="i-lucide-upload" size="sm" @click="handleUpload">上传文件</UButton>
          <span class="hidden max-w-40 truncate text-sm text-muted md:block">
            {{ nickname || account }}
          </span>
          <UDropdownMenu :items="userMenuItems" :content="{ align: 'end' }">
            <UAvatar
              :src="avatar || undefined"
              icon="i-lucide-user"
              size="sm"
              class="cursor-pointer"
            />
          </UDropdownMenu>
        </header>

        <div class="min-h-0 flex-1 p-4">
          <FileTable
            v-model:search="search"
            :items="items"
            :loading="loading"
            :cut-ids="clipboard?.op === 'cut' ? clipboard.ids : []"
            @open-folder="handleOpenFolder"
            @folder-change="handleFolderChange"
            @selection-change="handleSelectionChange"
            @move="handleMove"
          />
        </div>
      </main>
    </div>

    <div v-else class="flex h-screen items-center justify-center bg-default">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
  </UApp>
</template>
