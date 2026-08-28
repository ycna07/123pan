<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { DriveFileType, DriveItem } from '@123pan/shared-types'
import { formatDate, formatSize } from '@renderer/utils/format'

const props = defineProps<{ items: DriveItem[] }>()

const emit = defineEmits<{ move: [id: string, targetId: string | null] }>()

const search = defineModel<string>('search', { default: '' })

const toast = useToast()

const currentFolderId = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const rowSelection = ref<Record<string, boolean>>({})
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

const typeIcons: Record<DriveFileType, string> = {
  folder: 'i-lucide-folder',
  doc: 'i-lucide-file-text',
  image: 'i-lucide-image',
  video: 'i-lucide-film',
  audio: 'i-lucide-music',
  archive: 'i-lucide-archive',
  other: 'i-lucide-file'
}

const breadcrumbs = computed(() => {
  const crumbs: Array<{ id: string | null; name: string }> = [{ id: null, name: '全部文件' }]
  const chain: DriveItem[] = []
  let cursor = props.items.find((item) => item.id === currentFolderId.value)
  while (cursor) {
    chain.unshift(cursor)
    const parentId = cursor.parentId
    cursor = parentId ? props.items.find((item) => item.id === parentId) : undefined
  }
  for (const folder of chain) crumbs.push({ id: folder.id, name: folder.name })
  return crumbs
})

const visibleItems = computed(() =>
  props.items.filter((item) => item.parentId === currentFolderId.value)
)

const filteredItems = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return visibleItems.value
  return visibleItems.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

const columns: TableColumn<DriveItem>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'size', header: '大小' },
  { accessorKey: 'updatedAt', header: '修改时间' },
  { id: 'actions', header: '', enableSorting: false }
]

function getRowId(row: DriveItem): string {
  return row.id
}

function navigateTo(folderId: string | null): void {
  currentFolderId.value = folderId
  selectedId.value = null
  rowSelection.value = {}
}

function selectItem(item: DriveItem): void {
  selectedId.value = item.id
  rowSelection.value = { [item.id]: true }
}

function openItem(item: DriveItem): void {
  if (item.type === 'folder') {
    navigateTo(item.id)
  } else {
    toast.add({ title: `「${item.name}」预览功能开发中`, icon: 'i-lucide-eye' })
  }
}

function canDropInto(target: DriveItem): boolean {
  if (target.type !== 'folder' || !draggingId.value) return false
  if (target.id === draggingId.value) return false
  let cursor = props.items.find((item) => item.id === target.id)
  while (cursor?.parentId) {
    if (cursor.parentId === draggingId.value) return false
    const parentId = cursor.parentId
    cursor = props.items.find((item) => item.id === parentId)
  }
  return true
}

function onDragStart(item: DriveItem, event: DragEvent): void {
  draggingId.value = item.id
  event.dataTransfer?.setData('text/plain', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(item: DriveItem, event: DragEvent): void {
  if (!canDropInto(item)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverId.value = item.id
}

function onDragLeave(item: DriveItem): void {
  if (dragOverId.value === item.id) dragOverId.value = null
}

function onDrop(target: DriveItem | null): void {
  const dragging = draggingId.value
  dragOverId.value = null
  draggingId.value = null
  if (!dragging) return
  if (target && !canDropInto(target)) return
  emit('move', dragging, target ? target.id : null)
}

interface ItemEventHandlers {
  click: () => void
  dblclick: () => void
  dragstart: (event: DragEvent) => void
  dragover: (event: DragEvent) => void
  dragleave: () => void
  drop: () => void
}

interface CrumbEventHandlers {
  click: () => void
  dragover: (event: DragEvent) => void
  drop: () => void
}

function rowHandlers(item: DriveItem): ItemEventHandlers {
  return {
    click: () => selectItem(item),
    dblclick: () => openItem(item),
    dragstart: (event: DragEvent) => onDragStart(item, event),
    dragover: (event: DragEvent) => onDragOver(item, event),
    dragleave: () => onDragLeave(item),
    drop: () => onDrop(item)
  }
}

function crumbHandlers(crumb: { id: string | null }): CrumbEventHandlers {
  return {
    click: () => navigateTo(crumb.id),
    dragover: (event: DragEvent) => {
      if (!draggingId.value) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    },
    drop: () => onDrop(crumb.id ? (props.items.find((item) => item.id === crumb.id) ?? null) : null)
  }
}

function rowActions(item: DriveItem): DropdownMenuItem[][] {
  const actions: DropdownMenuItem[] = []
  if (item.type === 'folder') {
    actions.push({ label: '打开', icon: 'i-lucide-folder-open', onSelect: () => openItem(item) })
  }
  actions.push(
    {
      label: '下载',
      icon: 'i-lucide-download',
      onSelect: () => toast.add({ title: `开始下载「${item.name}」`, icon: 'i-lucide-download' })
    },
    {
      label: '分享',
      icon: 'i-lucide-link-2',
      onSelect: () =>
        toast.add({ title: `已创建「${item.name}」的分享链接`, icon: 'i-lucide-link-2' })
    },
    {
      label: '重命名',
      icon: 'i-lucide-pencil',
      onSelect: () =>
        toast.add({
          title: '演示版暂不支持重命名',
          color: 'warning',
          icon: 'i-lucide-triangle-alert'
        })
    },
    {
      label: '删除',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () =>
        toast.add({
          title: `已将「${item.name}」移入回收站`,
          color: 'error',
          icon: 'i-lucide-trash-2'
        })
    }
  )
  return [actions]
}

function onContainerClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('tr')) return
  selectedId.value = null
  rowSelection.value = {}
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default">
    <div class="flex items-center justify-between gap-4 border-b border-default px-4 py-2">
      <nav class="flex min-w-0 items-center" aria-label="面包屑">
        <button
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.id ?? 'root'"
          type="button"
          class="flex shrink-0 items-center rounded px-1.5 py-1 text-sm hover:bg-elevated"
          :class="index === breadcrumbs.length - 1 ? 'font-medium text-highlighted' : 'text-muted'"
          v-on="crumbHandlers(crumb)"
        >
          {{ crumb.name }}
          <UIcon
            v-if="index < breadcrumbs.length - 1"
            name="i-lucide-chevron-right"
            class="size-3.5 text-dimmed"
          />
        </button>
      </nav>
      <span class="shrink-0 text-xs text-muted">共 {{ filteredItems.length }} 项</span>
    </div>

    <UTable
      v-model:row-selection="rowSelection"
      :data="filteredItems"
      :columns="columns"
      :get-row-id="getRowId"
      :row-selection-options="{ enableRowSelection: true, enableMultiRowSelection: false }"
      :ui="{ tr: 'cursor-pointer' }"
      sticky
      class="min-h-0 flex-1"
      @click="onContainerClick"
    >
      <template #name-cell="{ row }">
        <div
          draggable="true"
          class="-m-4 flex h-full min-w-0 items-center gap-2.5 p-4"
          :class="dragOverId === row.original.id ? 'bg-primary/10' : ''"
          v-on="rowHandlers(row.original)"
        >
          <UIcon
            :name="typeIcons[row.original.type]"
            class="size-5 shrink-0"
            :class="row.original.type === 'folder' ? 'text-primary' : 'text-muted'"
          />
          <span class="truncate font-medium text-highlighted">{{ row.original.name }}</span>
          <UIcon
            v-if="row.original.starred"
            name="i-lucide-star"
            class="size-4 shrink-0 text-warning"
          />
        </div>
      </template>
      <template #size-cell="{ row }">
        <div
          draggable="true"
          class="-m-4 flex h-full items-center p-4"
          :class="dragOverId === row.original.id ? 'bg-primary/10' : ''"
          v-on="rowHandlers(row.original)"
        >
          <span class="tabular-nums">
            {{ row.original.type === 'folder' ? '-' : formatSize(row.original.size) }}
          </span>
        </div>
      </template>
      <template #updatedAt-cell="{ row }">
        <div
          draggable="true"
          class="-m-4 flex h-full items-center p-4"
          :class="dragOverId === row.original.id ? 'bg-primary/10' : ''"
          v-on="rowHandlers(row.original)"
        >
          <span class="tabular-nums">{{ formatDate(row.original.updatedAt) }}</span>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div
          draggable="true"
          class="-m-4 flex h-full items-center justify-end p-4"
          :class="dragOverId === row.original.id ? 'bg-primary/10' : ''"
          v-on="rowHandlers(row.original)"
        >
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
          <UIcon name="i-lucide-folder-open" class="size-10 text-dimmed" />
          <p>{{ search ? '没有找到匹配的文件' : '此文件夹为空' }}</p>
        </div>
      </template>
    </UTable>
  </div>
</template>
