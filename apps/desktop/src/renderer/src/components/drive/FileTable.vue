<script setup lang="ts">
import { computed } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import type { DriveFileType, DriveItem } from '@123pan/shared-types'
import { formatDate, formatSize } from '@renderer/utils/format'

const props = defineProps<{ items: DriveItem[] }>()

const search = defineModel<string>('search', { default: '' })

const toast = useToast()

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
  if (!keyword) return props.items
  return props.items.filter((item) => item.name.toLowerCase().includes(keyword))
})

const columns: TableColumn<DriveItem>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'size', header: '大小' },
  { accessorKey: 'updatedAt', header: '修改时间' },
  { id: 'actions', header: '', enableSorting: false }
]

function rowActions(item: DriveItem) {
  return [
    [
      {
        label: '下载',
        icon: 'i-lucide-download',
        onSelect: () => toast.add({ title: `开始下载「${item.name}」`, icon: 'i-lucide-download' })
      },
      {
        label: '分享',
        icon: 'i-lucide-link-2',
        onSelect: () => toast.add({ title: `已创建「${item.name}」的分享链接`, icon: 'i-lucide-link-2' })
      },
      {
        label: '重命名',
        icon: 'i-lucide-pencil',
        onSelect: () => toast.add({ title: '演示版暂不支持重命名', color: 'warning', icon: 'i-lucide-triangle-alert' })
      },
      {
        label: '删除',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => toast.add({ title: `已将「${item.name}」移入回收站`, color: 'error', icon: 'i-lucide-trash-2' })
      }
    ]
  ]
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default">
    <UTable :data="filteredItems" :columns="columns" sticky class="flex-1 overflow-auto">
      <template #name-cell="{ row }">
        <div class="flex items-center gap-2.5">
          <UIcon
            :name="typeIcons[row.original.type]"
            class="size-5 shrink-0"
            :class="row.original.type === 'folder' ? 'text-primary' : 'text-muted'"
          />
          <span class="truncate font-medium text-highlighted">{{ row.original.name }}</span>
          <UIcon v-if="row.original.starred" name="i-lucide-star" class="size-4 shrink-0 text-warning" />
        </div>
      </template>
      <template #size-cell="{ row }">
        <span class="tabular-nums text-muted">
          {{ row.original.type === 'folder' ? '-' : formatSize(row.original.size) }}
        </span>
      </template>
      <template #updatedAt-cell="{ row }">
        <span class="tabular-nums text-muted">{{ formatDate(row.original.updatedAt) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="text-right">
          <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis-vertical" size="sm" color="neutral" variant="ghost" aria-label="更多操作" />
          </UDropdownMenu>
        </div>
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-2 py-16 text-muted">
          <UIcon name="i-lucide-folder-open" class="size-10 text-dimmed" />
          <p>没有找到匹配的文件</p>
        </div>
      </template>
    </UTable>
    <div class="flex items-center border-t border-default px-4 py-2.5 text-xs text-muted">
      <span>共 {{ filteredItems.length }} 项</span>
    </div>
  </div>
</template>
