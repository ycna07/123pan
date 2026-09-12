<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { ShareRecord } from '@123pan/shared-types'
import { formatDate } from '@renderer/utils/format'

const emit = defineEmits<{ openShare: [link: string] }>()

const toast = useToast()

const shares = ref<ShareRecord[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const next = ref<number | null>(null)
const search = ref('')
const rowSelection = ref<Record<string, boolean>>({})
const confirmOpen = ref(false)
const pendingDeleteIds = ref<string[]>([])

const selectedIds = computed(() =>
  Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([id]) => id)
)

const filteredShares = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return shares.value
  return shares.value.filter((share) =>
    [share.name, share.key, share.pwd].some((value) =>
      (value ?? '').toLowerCase().includes(keyword)
    )
  )
})

const pendingDeleteNames = computed(() =>
  shares.value
    .filter((share) => pendingDeleteIds.value.includes(share.id))
    .map((share) => share.name)
)

const columns: TableColumn<ShareRecord>[] = [
  { id: 'select', enableSorting: false },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'pwd', header: '提取码', enableSorting: false },
  { accessorKey: 'expireAt', header: '有效期' },
  { id: 'stats', header: '访问', enableSorting: false },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '', enableSorting: false }
]

function getRowId(row: ShareRecord): string {
  return row.id
}

function clearSelection(): void {
  rowSelection.value = {}
}

function showError(error: unknown, fallback: string): void {
  toast.add({
    title: error instanceof Error ? error.message : fallback,
    color: 'error',
    icon: 'i-lucide-triangle-alert'
  })
}

function expireLabel(share: ShareRecord): string {
  if (share.expired) return '已过期'
  const year = new Date(share.expireAt).getFullYear()
  if (year >= 9999) return '永久'
  return formatDate(share.expireAt)
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await window.api.listShares()
    shares.value = result.shares
    next.value = result.next
    clearSelection()
  } catch (error) {
    showError(error, '加载分享列表失败')
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (next.value === null || loadingMore.value) return
  loadingMore.value = true
  try {
    const result = await window.api.listShares({ next: next.value })
    const known = new Set(shares.value.map((share) => share.id))
    shares.value.push(...result.shares.filter((share) => !known.has(share.id)))
    next.value = result.next
  } catch (error) {
    showError(error, '加载更多分享失败')
  } finally {
    loadingMore.value = false
  }
}

async function copyLink(share: ShareRecord): Promise<void> {
  try {
    await window.api.copyText(share.url)
    toast.add({ title: '分享链接已复制', icon: 'i-lucide-copy', duration: 1500 })
  } catch (error) {
    showError(error, '复制分享链接失败')
  }
}

function requestDelete(ids: string[]): void {
  if (ids.length === 0) {
    toast.add({ title: '请先勾选要取消的分享', color: 'info', icon: 'i-lucide-info' })
    return
  }
  pendingDeleteIds.value = [...ids]
  confirmOpen.value = true
}

function confirmDelete(): void {
  const ids = [...pendingDeleteIds.value]
  confirmOpen.value = false
  pendingDeleteIds.value = []
  void window.api
    .deleteShares(ids)
    .then(() => {
      shares.value = shares.value.filter((share) => !ids.includes(share.id))
      clearSelection()
      toast.add({ title: `已取消 ${ids.length} 个分享`, icon: 'i-lucide-link-2-off' })
    })
    .catch((error) => showError(error, '取消分享失败'))
}

function rowActions(share: ShareRecord): DropdownMenuItem[][] {
  return [
    [
      {
        label: '打开分享',
        icon: 'i-lucide-external-link',
        onSelect: () => emit('openShare', share.url)
      },
      { label: '复制链接', icon: 'i-lucide-copy', onSelect: () => copyLink(share) }
    ],
    [
      {
        label: '取消分享',
        icon: 'i-lucide-link-2-off',
        color: 'error',
        onSelect: () => requestDelete([share.id])
      }
    ]
  ]
}

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default">
    <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索分享名称 / 分享码..."
        size="sm"
        class="w-56"
      />
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">
          {{ selectedIds.length > 0 ? `已选 ${selectedIds.length} 项 / ` : '' }}共
          {{ filteredShares.length }} 项
        </span>
        <UButton
          icon="i-lucide-link-2-off"
          size="sm"
          color="error"
          variant="outline"
          :disabled="selectedIds.length === 0"
          @click="requestDelete(selectedIds)"
        >
          取消分享
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          size="sm"
          color="neutral"
          variant="ghost"
          aria-label="刷新"
          :loading="loading"
          @click="load"
        />
      </div>
    </div>

    <UTable
      v-model:row-selection="rowSelection"
      :data="filteredShares"
      :columns="columns"
      :get-row-id="getRowId"
      :row-selection-options="{ enableRowSelection: true }"
      :ui="{ tr: 'cursor-pointer' }"
      sticky
      class="min-h-0 flex-1"
      @click="
        (event: MouseEvent) => {
          if (!(event.target as HTMLElement).closest('tr')) clearSelection()
        }
      "
    >
      <template #select-header="{ table }">
        <UCheckbox
          :model-value="
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          "
          @update:model-value="table.toggleAllPageRowsSelected(Boolean($event))"
        />
      </template>
      <template #select-cell="{ row }">
        <UCheckbox
          :model-value="row.getIsSelected()"
          @update:model-value="row.toggleSelected(Boolean($event))"
          @click.stop
        />
      </template>
      <template #name-cell="{ row }">
        <div class="flex min-w-0 flex-col" @click="row.toggleSelected(true)">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-link-2" class="size-4 shrink-0 text-primary" />
            <span class="truncate font-medium text-highlighted">{{ row.original.name }}</span>
            <UBadge v-if="row.original.expired" color="error" variant="subtle" size="sm">
              已过期
            </UBadge>
          </div>
          <span class="truncate pl-6.5 text-xs text-muted">{{ row.original.key }}</span>
        </div>
      </template>
      <template #pwd-cell="{ row }">
        <div class="flex items-center" @click="row.toggleSelected(true)">
          <span v-if="row.original.pwd" class="font-mono text-sm">{{ row.original.pwd }}</span>
          <span v-else class="text-muted">无</span>
        </div>
      </template>
      <template #expireAt-cell="{ row }">
        <div class="flex items-center" @click="row.toggleSelected(true)">
          <span class="tabular-nums">{{ expireLabel(row.original) }}</span>
        </div>
      </template>
      <template #stats-cell="{ row }">
        <div class="flex items-center text-xs text-muted" @click="row.toggleSelected(true)">
          浏览 {{ row.original.previewCount }} · 下载 {{ row.original.downloadCount }} · 转存
          {{ row.original.saveCount }}
        </div>
      </template>
      <template #createdAt-cell="{ row }">
        <div class="flex items-center" @click="row.toggleSelected(true)">
          <span class="tabular-nums">{{ formatDate(row.original.createdAt) }}</span>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            icon="i-lucide-copy"
            size="sm"
            color="neutral"
            variant="ghost"
            aria-label="复制链接"
            @click.stop="copyLink(row.original)"
          />
          <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="更多操作"
              @click.stop
            />
          </UDropdownMenu>
        </div>
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-2 py-16 text-muted">
          <UIcon
            :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-link-2'"
            class="size-10 text-dimmed"
            :class="loading ? 'animate-spin' : ''"
          />
          <p v-if="loading">正在加载分享…</p>
          <p v-else>{{ search ? '没有找到匹配的分享' : '还没有创建过分享' }}</p>
        </div>
      </template>
    </UTable>

    <div v-if="next !== null" class="flex justify-center border-t border-default py-2">
      <UButton size="sm" color="neutral" variant="ghost" :loading="loadingMore" @click="loadMore">
        加载更多
      </UButton>
    </div>

    <UModal v-model:open="confirmOpen" title="取消分享">
      <template #body>
        <p class="text-sm text-muted">
          将取消
          <span class="font-medium text-highlighted">
            {{ pendingDeleteNames.length > 0 ? `「${pendingDeleteNames[0]}」` : '' }}
          </span>
          <span v-if="pendingDeleteIds.length > 1">等 {{ pendingDeleteIds.length }} 个</span>
          分享，取消后原链接将立即失效，确定继续吗？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" size="sm" @click="confirmOpen = false">
            取消
          </UButton>
          <UButton color="error" size="sm" @click="confirmDelete">取消分享</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
