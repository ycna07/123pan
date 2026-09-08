<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { DriveFileType, DriveItem } from '@123pan/shared-types'
import { formatDate, formatSize } from '@renderer/utils/format'

const toast = useToast()

const items = ref<DriveItem[]>([])
const loading = ref(false)
const search = ref('')
const rowSelection = ref<Record<string, boolean>>({})
const confirmOpen = ref(false)
const pendingDeleteIds = ref<string[]>([])

const typeIcons: Record<DriveFileType, string> = {
  folder: 'i-lucide-folder',
  doc: 'i-lucide-file-text',
  image: 'i-lucide-image',
  video: 'i-lucide-film',
  audio: 'i-lucide-music',
  archive: 'i-lucide-archive',
  other: 'i-lucide-file'
}

const filteredItems = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return items.value
  return items.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

const selectedIds = computed(() =>
  Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([id]) => id)
)

const pendingDeleteNames = computed(() =>
  items.value.filter((item) => pendingDeleteIds.value.includes(item.id)).map((item) => item.name)
)

const columns: TableColumn<DriveItem>[] = [
  { id: 'select', enableSorting: false },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'size', header: '大小' },
  { accessorKey: 'updatedAt', header: '删除时间' },
  { id: 'actions', header: '', enableSorting: false }
]

function getRowId(row: DriveItem): string {
  return row.id
}

function clearSelection(): void {
  rowSelection.value = {}
}

function removeFromView(ids: string[]): void {
  items.value = items.value.filter((item) => !ids.includes(item.id))
  clearSelection()
}

function showError(error: unknown, fallback: string): void {
  toast.add({
    title: error instanceof Error ? error.message : fallback,
    color: 'error',
    icon: 'i-lucide-triangle-alert'
  })
}

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await window.api.listTrashFiles()
    clearSelection()
  } catch (error) {
    showError(error, '加载回收站失败')
  } finally {
    loading.value = false
  }
}

function restoreSelected(ids: string[]): void {
  if (ids.length === 0) {
    toast.add({ title: '请先勾选要恢复的文件', color: 'info', icon: 'i-lucide-info' })
    return
  }
  void window.api
    .restoreFiles([...ids])
    .then(() => {
      removeFromView([...ids])
      toast.add({ title: `已恢复 ${ids.length} 项至原位置`, icon: 'i-lucide-undo-2' })
    })
    .catch((error) => showError(error, '恢复文件失败'))
}

function requestDeleteForever(ids: string[]): void {
  if (ids.length === 0) {
    toast.add({ title: '请先勾选要彻底删除的文件', color: 'info', icon: 'i-lucide-info' })
    return
  }
  pendingDeleteIds.value = [...ids]
  confirmOpen.value = true
}

function confirmDeleteForever(): void {
  const ids = [...pendingDeleteIds.value]
  confirmOpen.value = false
  pendingDeleteIds.value = []
  void window.api
    .deleteFilesForever(ids)
    .then(() => {
      removeFromView(ids)
      toast.add({ title: `已彻底删除 ${ids.length} 项`, icon: 'i-lucide-trash-2' })
    })
    .catch((error) => showError(error, '彻底删除文件失败'))
}

function rowActions(item: DriveItem): DropdownMenuItem[][] {
  return [
    [
      { label: '恢复', icon: 'i-lucide-undo-2', onSelect: () => restoreSelected([item.id]) },
      {
        label: '彻底删除',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => requestDeleteForever([item.id])
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
        placeholder="搜索回收站..."
        size="sm"
        class="w-56"
      />
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">
          {{ selectedIds.length > 0 ? `已选 ${selectedIds.length} 项 / ` : '' }}共
          {{ filteredItems.length }} 项
        </span>
        <UButton
          icon="i-lucide-undo-2"
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="selectedIds.length === 0"
          @click="restoreSelected(selectedIds)"
        >
          恢复
        </UButton>
        <UButton
          icon="i-lucide-trash-2"
          size="sm"
          color="error"
          variant="outline"
          :disabled="selectedIds.length === 0"
          @click="requestDeleteForever(selectedIds)"
        >
          彻底删除
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
      :data="filteredItems"
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
        <div
          class="-m-4 flex h-full min-w-0 items-center gap-2.5 p-4"
          @click="row.toggleSelected(true)"
        >
          <UIcon
            :name="typeIcons[row.original.type]"
            class="size-5 shrink-0"
            :class="row.original.type === 'folder' ? 'text-primary' : 'text-muted'"
          />
          <span class="truncate font-medium text-highlighted">{{ row.original.name }}</span>
        </div>
      </template>
      <template #size-cell="{ row }">
        <div class="-m-4 flex h-full items-center p-4" @click="row.toggleSelected(true)">
          <span class="tabular-nums">
            {{ row.original.type === 'folder' ? '-' : formatSize(row.original.size) }}
          </span>
        </div>
      </template>
      <template #updatedAt-cell="{ row }">
        <div class="-m-4 flex h-full items-center p-4" @click="row.toggleSelected(true)">
          <span class="tabular-nums">{{ formatDate(row.original.updatedAt) }}</span>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="-m-4 flex h-full items-center justify-end p-4">
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
            :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-trash-2'"
            class="size-10 text-dimmed"
            :class="loading ? 'animate-spin' : ''"
          />
          <p v-if="loading">正在加载回收站…</p>
          <p v-else>{{ search ? '没有找到匹配的文件' : '回收站为空' }}</p>
        </div>
      </template>
    </UTable>

    <UModal v-model:open="confirmOpen" title="彻底删除">
      <template #body>
        <p class="text-sm text-muted">
          将彻底删除
          <span class="font-medium text-highlighted">
            {{ pendingDeleteNames.length > 0 ? `「${pendingDeleteNames[0]}」` : '' }}
          </span>
          <span v-if="pendingDeleteIds.length > 1">等 {{ pendingDeleteIds.length }} 项</span>
          ，此操作不可恢复，确定继续吗？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" size="sm" @click="confirmOpen = false">
            取消
          </UButton>
          <UButton color="error" size="sm" @click="confirmDeleteForever">彻底删除</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
