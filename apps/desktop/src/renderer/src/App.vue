<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { DriveItem } from '@123pan/shared-types'
import { mockDriveItems } from '@renderer/data/files'

const toast = useToast()

const authed = ref<boolean | null>(null)
const account = ref('')
const search = ref('')
const items = ref<DriveItem[]>(mockDriveItems)

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
      authed.value = false
    }
  }
]

onMounted(async () => {
  try {
    const status = await window.api.getAuthStatus()
    authed.value = status.authenticated
    account.value = status.account ?? ''
  } catch {
    authed.value = false
  }
})

function handleAuthenticated(authenticatedAccount: string): void {
  account.value = authenticatedAccount
  authed.value = true
  toast.add({ title: `欢迎回来，${authenticatedAccount}`, icon: 'i-lucide-party-popper' })
}

function handleUpload(): void {
  toast.add({
    title: '上传功能开发中',
    description: '文件显示部分已完成，上传流程即将接入',
    icon: 'i-lucide-upload'
  })
}

function handleMove(id: string, targetId: string | null): void {
  const item = items.value.find((entry) => entry.id === id)
  if (!item || item.parentId === targetId) return
  const targetName = targetId
    ? (items.value.find((entry) => entry.id === targetId)?.name ?? '全部文件')
    : '全部文件'
  item.parentId = targetId
  toast.add({ title: `已移动「${item.name}」至「${targetName}」`, icon: 'i-lucide-folder-input' })
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
        <UNavigationMenu orientation="vertical" :items="navItems" class="flex-1 px-2" />
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
          <UButton icon="i-lucide-upload" size="sm" @click="handleUpload">上传文件</UButton>
          <span class="hidden max-w-40 truncate text-sm text-muted md:block">{{ account }}</span>
          <UDropdownMenu :items="userMenuItems" :content="{ align: 'end' }">
            <UAvatar icon="i-lucide-user" size="sm" class="cursor-pointer" />
          </UDropdownMenu>
        </header>

        <div class="min-h-0 flex-1 p-4">
          <FileTable v-model:search="search" :items="items" @move="handleMove" />
        </div>
      </main>
    </div>

    <div v-else class="flex h-screen items-center justify-center bg-default">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
  </UApp>
</template>
