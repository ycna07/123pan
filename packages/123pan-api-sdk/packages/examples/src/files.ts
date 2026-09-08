import { createClient, tokenTtlMs } from './client'

/**
 * 遍历根目录文件列表（lastFileId 翻页），并展示直链下载地址的获取方式
 */
const sdk = createClient()

const info = await sdk.getTokenInfo()
if (info) {
  const ttl = tokenTtlMs(info.accessToken)
  console.log('token 剩余有效期:', ttl === null ? '未知' : `${Math.floor(ttl / 3600)} 小时`)
}

let lastFileId: number | undefined
let page = 1
for (;;) {
  const response = await sdk.file.getFileList({
    parentFileId: 0,
    limit: 20,
    ...(lastFileId !== undefined && { lastFileId })
  })

  for (const item of response.data.fileList) {
    const kind = item.type === 1 ? '目录' : '文件'
    const size = item.type === 1 ? '-' : `${(item.size / 1024 / 1024).toFixed(2)} MB`
    console.log(`[${kind}] ${item.filename}  ${size}  (id: ${item.fileId})`)
  }
  console.log(`-- 第 ${page} 页，共 ${response.data.fileList.length} 项 --`)

  lastFileId = response.data.lastFileId
  page += 1
  if (lastFileId === -1) {
    break
  }
}
