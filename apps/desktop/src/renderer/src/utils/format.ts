export function formatSize(bytes: number): string {
  if (bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** 文件夹大小：0 字节显示 0.00 B，区别于大小未知的 '-' */
export function formatFolderSize(bytes: number): string {
  return bytes > 0 ? formatSize(bytes) : '0.00 B'
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
