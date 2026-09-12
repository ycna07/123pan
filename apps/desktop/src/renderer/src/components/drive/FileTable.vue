<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, resolveComponent, watch } from 'vue'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { DriveFileType, DriveItem } from '@123pan/shared-types'
import { formatDate, formatSize } from '@renderer/utils/format'

const props = defineProps<{
  items: DriveItem[]
  loading?: boolean
  clipboard?: { op: 'copy' | 'cut'; ids: string[] } | null
}>()

const emit = defineEmits<{
  move: [id: string, targetId: string | null]
  openFolder: [folderId: string]
  selectionChange: [ids: string[]]
  folderChange: [folderId: string | null]
  download: [item: DriveItem]
  copyLink: [item: DriveItem]
  paste: [targetFolderId: string]
  clipboardOperation: [op: 'copy' | 'cut', ids: string[]]
  uploadFiles: [paths: string[]]
  delete: [item: DriveItem]
  exportReuse: [item: DriveItem]
  share: [items: DriveItem[]]
}>()

const cutSet = computed(() =>
  props.clipboard?.op === 'cut' ? new Set(props.clipboard.ids) : new Set<string>()
)

interface ContextMenuState {
  item: DriveItem
  x: number
  y: number
}

const contextMenu = ref<ContextMenuState | null>(null)

function onRowContextMenu(item: DriveItem, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  // 右键已选中的项时保留整组选择；未选中则只选中该项
  if (!rowSelection.value[item.id]) selectItem(item)
  const MENU_WIDTH = 200
  const MENU_HEIGHT = 320
  contextMenu.value = {
    item,
    x: Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8),
    y: Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8)
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function runMenuAction(action: DropdownMenuItem): void {
  closeContextMenu()
  action.onSelect?.(new CustomEvent('menu-action'))
}

function onWindowClick(): void {
  if (contextMenu.value) closeContextMenu()
}

function onWindowContextMenu(event: MouseEvent): void {
  if (contextMenu.value) closeContextMenu()
  event.preventDefault()
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', onWindowClick)
  window.addEventListener('contextmenu', onWindowContextMenu)
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
  window.removeEventListener('contextmenu', onWindowContextMenu)
  window.removeEventListener('keydown', onWindowKeydown)
})

const search = defineModel<string>('search', { default: '' })

const toast = useToast()

const rootRef = ref<HTMLElement | null>(null)
const currentFolderId = ref<string | null>(null)
const rowSelection = ref<Record<string, boolean>>({})
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const marquee = ref<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
const marqueeActive = ref(false)
const suppressClick = ref(false)

const MARQUEE_THRESHOLD = 4

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

const selectedCount = computed(() => Object.values(rowSelection.value).filter(Boolean).length)

const UButton = resolveComponent('UButton')

function sortableHeader(label: string): TableColumn<DriveItem>['header'] {
  return ({ column }) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      icon: sorted
        ? sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(sorted === 'asc')
    })
  }
}

const columns: TableColumn<DriveItem>[] = [
  { id: 'select', enableSorting: false },
  { accessorKey: 'name', header: sortableHeader('名称') },
  { accessorKey: 'size', header: sortableHeader('大小') },
  { accessorKey: 'updatedAt', header: sortableHeader('修改时间') },
  { id: 'actions', header: '', enableSorting: false }
]

const marqueeStyle = computed(() => {
  if (!marqueeActive.value || !marquee.value) return undefined
  const root = rootRef.value
  if (!root) return undefined
  const rootRect = root.getBoundingClientRect()
  return {
    left: `${Math.min(marquee.value.startX, marquee.value.endX) - rootRect.left}px`,
    top: `${Math.min(marquee.value.startY, marquee.value.endY) - rootRect.top}px`,
    width: `${Math.abs(marquee.value.endX - marquee.value.startX)}px`,
    height: `${Math.abs(marquee.value.endY - marquee.value.startY)}px`
  }
})

function getRowId(row: DriveItem): string {
  return row.id
}

function navigateTo(folderId: string | null): void {
  currentFolderId.value = folderId
  rowSelection.value = {}
  closeContextMenu()
  emit('folderChange', folderId)
}

watch(
  rowSelection,
  (selection) => {
    emit(
      'selectionChange',
      Object.entries(selection)
        .filter(([, selected]) => selected)
        .map(([id]) => id)
    )
  },
  { deep: true }
)

function selectItem(item: DriveItem): void {
  rowSelection.value = { [item.id]: true }
}

function openItem(item: DriveItem): void {
  if (item.type === 'folder') {
    emit('openFolder', item.id)
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
  if (!dragging) return
  if (target && !canDropInto(target)) {
    dragOverId.value = null
    draggingId.value = null
    return
  }
  dragOverId.value = null
  draggingId.value = null
  emit('move', dragging, target ? target.id : null)
}

function onMarqueeStart(event: PointerEvent): void {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (
    target.closest('tr') ||
    target.closest('nav') ||
    target.closest('button') ||
    target.closest('input')
  )
    return
  if (!rootRef.value) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  marquee.value = {
    startX: event.clientX,
    startY: event.clientY,
    endX: event.clientX,
    endY: event.clientY
  }
  marqueeActive.value = false
}

function onMarqueeMove(event: PointerEvent): void {
  if (!marquee.value) return
  if (!marqueeActive.value) {
    const dx = Math.abs(event.clientX - marquee.value.startX)
    const dy = Math.abs(event.clientY - marquee.value.startY)
    if (dx < MARQUEE_THRESHOLD && dy < MARQUEE_THRESHOLD) return
    marqueeActive.value = true
    suppressClick.value = true
    document.body.style.userSelect = 'none'
  }
  marquee.value = { ...marquee.value, endX: event.clientX, endY: event.clientY }
  applyMarqueeSelection()
}

function applyMarqueeSelection(): void {
  const root = rootRef.value
  const rect = marquee.value
  if (!root || !rect || !marqueeActive.value) return
  const rootRect = root.getBoundingClientRect()
  const left = Math.min(rect.startX, rect.endX) - rootRect.left
  const top = Math.min(rect.startY, rect.endY) - rootRect.top
  const right = Math.max(rect.startX, rect.endX) - rootRect.left
  const bottom = Math.max(rect.startY, rect.endY) - rootRect.top
  const selection: Record<string, boolean> = {}
  root.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((rowEl, index) => {
    const rowRect = rowEl.getBoundingClientRect()
    const intersects =
      rowRect.left - rootRect.left < right &&
      rowRect.right - rootRect.left > left &&
      rowRect.top - rootRect.top < bottom &&
      rowRect.bottom - rootRect.top > top
    const item = filteredItems.value[index]
    if (intersects && item) selection[item.id] = true
  })
  rowSelection.value = selection
}

function onMarqueeEnd(): void {
  if (!marquee.value) return
  marquee.value = null
  marqueeActive.value = false
  document.body.style.userSelect = ''
}

interface ItemEventHandlers {
  click: () => void
  dblclick: () => void
  dragstart: (event: DragEvent) => void
  dragover: (event: DragEvent) => void
  dragleave: () => void
  drop: () => void
  contextmenu: (event: MouseEvent) => void
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
    drop: () => onDrop(item),
    contextmenu: (event: MouseEvent) => onRowContextMenu(item, event)
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

/** 分享作用范围：已选多项时分享整组选择，否则只分享该项 */
function selectedItemsFor(item: DriveItem): DriveItem[] {
  if (!rowSelection.value[item.id]) return [item]
  const ids = Object.keys(rowSelection.value).filter((key) => rowSelection.value[key])
  return props.items.filter((entry) => ids.includes(entry.id))
}

/** 右键菜单剪切/复制的作用范围：已选多项时作用于整组选择，否则只作用于右键项 */
function clipboardIdsFor(item: DriveItem): string[] {
  return rowSelection.value[item.id]
    ? Object.keys(rowSelection.value).filter((key) => rowSelection.value[key])
    : [item.id]
}

function buildMenuItems(item: DriveItem): DropdownMenuItem[][] {
  const actions: DropdownMenuItem[] = []
  if (item.type === 'folder') {
    actions.push({ label: '打开', icon: 'i-lucide-folder-open', onSelect: () => openItem(item) })
    if ((props.clipboard?.ids.length ?? 0) > 0) {
      actions.push({
        label: '粘贴到此文件夹',
        icon: 'i-lucide-clipboard-paste',
        onSelect: () => emit('paste', item.id)
      })
    }
  } else {
    actions.push(
      { label: '下载', icon: 'i-lucide-download', onSelect: () => emit('download', item) },
      { label: '复制直链', icon: 'i-lucide-link', onSelect: () => emit('copyLink', item) }
    )
  }
  actions.push(
    {
      label: '生成秒传 JSON',
      icon: 'i-lucide-file-json',
      onSelect: () => emit('exportReuse', item)
    },
    {
      label: '剪切',
      icon: 'i-lucide-scissors',
      onSelect: () => emit('clipboardOperation', 'cut', clipboardIdsFor(item))
    },
    {
      label: '复制',
      icon: 'i-lucide-copy',
      onSelect: () => emit('clipboardOperation', 'copy', clipboardIdsFor(item))
    },
    {
      label: '创建分享',
      icon: 'i-lucide-link-2',
      onSelect: () => emit('share', selectedItemsFor(item))
    },
    {
      label: '重命名',
      icon: 'i-lucide-pencil',
      onSelect: () =>
        toast.add({
          title: '重命名功能开发中',
          color: 'warning',
          icon: 'i-lucide-triangle-alert'
        })
    },
    {
      label: '删除',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => emit('delete', item)
    }
  )
  return [actions]
}

function onContainerClick(event: MouseEvent): void {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  if ((event.target as HTMLElement).closest('tr')) return
  rowSelection.value = {}
}

/** 操作系统文件拖入：与内部拖拽（text/plain）互不干扰 */
function onRootDragOver(event: DragEvent): void {
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onRootDrop(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.stopPropagation()
  const paths = [...event.dataTransfer.files]
    .map((file) => window.api.getPathForFile(file))
    .filter((path): path is string => !!path)
  if (paths.length > 0) emit('uploadFiles', paths)
}
</script>

<template>
  <div
    ref="rootRef"
    class="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default"
    @pointerdown="onMarqueeStart"
    @pointermove="onMarqueeMove"
    @pointerup="onMarqueeEnd"
    @pointercancel="onMarqueeEnd"
    @dragover="onRootDragOver"
    @drop="onRootDrop"
  >
    <div
      v-if="marqueeStyle"
      class="pointer-events-none absolute z-20 rounded-sm border border-primary bg-primary/10"
      :style="marqueeStyle"
    />

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed z-50 min-w-44 rounded-lg border border-default bg-default p-1 shadow-lg"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @contextmenu.prevent
      >
        <button
          v-for="action in buildMenuItems(contextMenu.item)[0]"
          :key="action.label"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-default hover:bg-elevated"
          :class="action.color === 'error' ? 'text-error hover:bg-error/10' : ''"
          @click.stop="runMenuAction(action)"
        >
          <UIcon v-if="action.icon" :name="action.icon" class="size-4 shrink-0 text-muted" />
          {{ action.label }}
        </button>
      </div>
    </Teleport>

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
      <span class="shrink-0 text-xs text-muted">
        {{ selectedCount > 0 ? `已选 ${selectedCount} 项 / ` : '' }}共 {{ filteredItems.length }} 项
      </span>
    </div>

    <UTable
      v-model:row-selection="rowSelection"
      :data="filteredItems"
      :columns="columns"
      :get-row-id="getRowId"
      :row-selection-options="{ enableRowSelection: true }"
      :ui="{
        base: 'border-separate border-spacing-0',
        tbody:
          '[&>tr]:cursor-pointer [&>tr]:transition [&>tr:hover]:shadow-[0_0_10px_rgba(0,0,0,0.12)] [&>tr:hover>td]:bg-elevated/50 [&>tr:hover>td:first-child]:rounded-s-lg [&>tr:hover>td:last-child]:rounded-e-lg'
      }"
      sticky
      class="min-h-0 flex-1"
      @click="onContainerClick"
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
          draggable="true"
          class="-m-4 flex h-full min-w-0 items-center gap-2.5 p-4"
          :class="[
            dragOverId === row.original.id ? 'bg-primary/10' : '',
            cutSet.has(row.original.id) ? 'opacity-50' : ''
          ]"
          v-on="rowHandlers(row.original)"
        >
          <UIcon
            :name="typeIcons[row.original.type]"
            class="size-5 shrink-0"
            :class="row.original.type === 'folder' ? 'text-primary' : 'text-muted'"
          />
          <span
            class="truncate font-medium text-highlighted transition-colors hover:text-primary hover:underline underline-offset-4"
          >
            {{ row.original.name }}
          </span>
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
          <UDropdownMenu :items="buildMenuItems(row.original)" :content="{ align: 'end' }">
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
            :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-folder-open'"
            class="size-10 text-dimmed"
            :class="loading ? 'animate-spin' : ''"
          />
          <p v-if="loading">正在加载文件列表…</p>
          <p v-else>{{ search ? '没有找到匹配的文件' : '此文件夹为空' }}</p>
        </div>
      </template>
    </UTable>
  </div>
</template>
