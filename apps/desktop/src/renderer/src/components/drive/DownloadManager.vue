<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import type { AppSettings, DownloadTask } from '@123pan/shared-types'
import { formatSize } from '@renderer/utils/format'

const toast = useToast()

const tasks = ref<DownloadTask[]>([])
const settings = ref<AppSettings | null>(null)
let removeUpdated: (() => void) | null = null

const active = (): DownloadTask[] => tasks.value.filter((t) => t.status === 'downloading')
const finished = (): DownloadTask[] =>
  tasks.value.filter((t) => t.status !== 'downloading' && t.status !== 'canceled')
const canceled = (): DownloadTask[] => tasks.value.filter((t) => t.status === 'canceled')

const percentOf = (task: DownloadTask): number =>
  task.size > 0 ? Math.min(100, (task.received / task.size) * 100) : 0

async function chooseDir(): Promise<void> {
  const dir = await window.api.chooseDownloadDir()
  if (dir) {
    settings.value = { ...(settings.value as AppSettings), downloadDir: dir }
    toast.add({ title: '默认下载目录已更新', description: dir, icon: 'i-lucide-folder-check' })
  }
}

async function toggleAsk(value: boolean): Promise<void> {
  settings.value = { ...(settings.value as AppSettings), askWhereToSave: value }
  await window.api.updateSettings({ askWhereToSave: value })
}

function cancel(id: string): void {
  void window.api.cancelDownload(id)
}

function reveal(task: DownloadTask): void {
  void window.api.revealDownload(task.id)
}

function retry(task: DownloadTask): void {
  void window.api.resumeDownload(task.id)
  toast.add({
    title: task.resumable ? `「${task.name}」继续下载` : `「${task.name}」已重新加入队列`,
    icon: 'i-lucide-download'
  })
}

const threadOptions = [1, 2, 3, 4, 6, 8]

async function updateThreads(value: string | number): Promise<void> {
  const threads = Number(value)
  settings.value = { ...(settings.value as AppSettings), downloadThreads: threads }
  await window.api.updateSettings({ downloadThreads: threads })
}

onMounted(async () => {
  removeUpdated = window.api.onDownloadUpdated((task) => {
    const index = tasks.value.findIndex((t) => t.id === task.id)
    if (index >= 0) tasks.value.splice(index, 1, task)
    else tasks.value.unshift(task)
  })
  tasks.value = await window.api.downloadsList()
  settings.value = await window.api.getSettings()
})

onBeforeUnmount(() => {
  removeUpdated?.()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-settings" class="size-4 text-muted" />
          <span class="font-medium text-highlighted">下载设置</span>
        </div>
      </template>
      <div v-if="settings" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">默认下载目录</p>
            <p class="truncate text-xs text-muted">
              {{ settings.downloadDir || '系统默认下载目录' }}
            </p>
          </div>
          <UButton icon="i-lucide-folder-open" size="sm" variant="outline" @click="chooseDir">
            选择目录
          </UButton>
        </div>
        <USeparator />
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-highlighted">下载线程数</p>
            <p class="text-xs text-muted">
              多连接分段下载的并发数（1-8）；服务器支持 Range 时可断点续传
            </p>
          </div>
          <USelect
            :model-value="settings.downloadThreads"
            :items="threadOptions"
            class="w-20"
            @update:model-value="updateThreads"
          />
        </div>
        <USeparator />
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-highlighted">每次下载询问保存位置</p>
            <p class="text-xs text-muted">
              开启后每次下载弹出保存对话框；关闭则直接保存到默认下载目录（同名自动追加序号）
            </p>
          </div>
          <USwitch
            :model-value="settings.askWhereToSave"
            @update:model-value="(v: boolean) => toggleAsk(v)"
          />
        </div>
      </div>
      <div v-else class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        加载设置中…
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-4 text-primary" />
            <span class="font-medium text-highlighted">进行中</span>
          </div>
          <UBadge v-if="active().length" :label="String(active().length)" variant="soft" />
        </div>
      </template>
      <div v-if="active().length === 0" class="py-6 text-center text-sm text-muted">
        暂无进行中的下载
      </div>
      <div v-else class="flex flex-col gap-4">
        <div v-for="task in active()" :key="task.id" class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0 truncate text-sm font-medium text-highlighted">
              {{ task.name }}
            </span>
            <div class="flex shrink-0 items-center gap-2">
              <span class="tabular-nums text-xs text-muted">
                {{ formatSize(task.received) }} / {{ task.size > 0 ? formatSize(task.size) : '…' }}
              </span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="取消下载"
                @click="cancel(task.id)"
              />
            </div>
          </div>
          <UProgress :model-value="percentOf(task)" size="xs" />
          <p class="truncate text-xs text-dimmed">{{ task.path }}</p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-check-circle-2" class="size-4 text-success" />
          <span class="font-medium text-highlighted">已完成</span>
        </div>
      </template>
      <div v-if="finished().length === 0" class="py-6 text-center text-sm text-muted">
        暂无已完成下载
      </div>
      <div v-else class="flex flex-col divide-y divide-default">
        <div
          v-for="task in finished()"
          :key="task.id"
          class="flex items-center justify-between gap-3 py-2.5"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-highlighted">
              <UIcon
                :name="task.status === 'failed' ? 'i-lucide-circle-x' : 'i-lucide-check'"
                :class="task.status === 'failed' ? 'text-error' : 'text-success'"
                class="mr-1.5 inline-block size-4 align-text-bottom"
              />
              {{ task.name }}
              <span v-if="task.status === 'failed'" class="text-xs text-error">
                {{ task.error }}
              </span>
            </p>
            <p class="truncate text-xs text-dimmed">{{ task.path }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <span class="tabular-nums text-xs text-muted">{{ formatSize(task.size) }}</span>
            <UButton
              v-if="task.status === 'failed'"
              :icon="task.resumable ? 'i-lucide-play' : 'i-lucide-rotate-cw'"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="task.resumable ? '继续下载' : '重试'"
              @click="retry(task)"
            />
            <UButton
              v-if="task.status === 'completed'"
              icon="i-lucide-external-link"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="打开所在文件夹"
              @click="reveal(task)"
            />
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="canceled().length > 0">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-ban" class="size-4 text-muted" />
          <span class="font-medium text-highlighted">已取消</span>
        </div>
      </template>
      <div class="flex flex-col divide-y divide-default">
        <div
          v-for="task in canceled()"
          :key="task.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <span class="min-w-0 truncate text-sm text-muted">{{ task.name }}</span>
          <UButton
            :icon="task.resumable ? 'i-lucide-play' : 'i-lucide-rotate-cw'"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="task.resumable ? '继续下载' : '重新下载'"
            @click="retry(task)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
