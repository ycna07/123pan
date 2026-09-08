<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

function handleOpenFolder(folderId: string): void {
  void loadFolder(folderId)
}

function handleMove(id: string, targetId: string | null): void {
  const item = items.value.find((entry) => entry.id === id)
  if (!item || item.parentId === targetId) return
  const targetName = targetId
    ? (items.value.find((entry) => entry.id === targetId)?.name ?? '全部文件')
    : '全部文件'
  item.parentId = targetId
  toast.add({
    title: `已移动「${item.name}」至「${targetName}」（本地演示，未同步云端）`,
    icon: 'i-lucide-folder-input'
  })
}

function handleAuthenticated(status: AuthStatus): void {
  applyAuthStatus(status)
  const displayName = status.nickname || status.account || '用户'
  toast.add({ title: `欢迎回来，${displayName}`, icon: 'i-lucide-party-popper' })
  void loadFolder(null)
}

onMounted(async () => {
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
            @open-folder="handleOpenFolder"
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
