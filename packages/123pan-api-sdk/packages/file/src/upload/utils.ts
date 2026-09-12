/**
 * 文件上传工具函数（Node.js环境专用）
 *
 * 注意：文件处理相关的工具函数（calculateMD5, sliceFile, getFileSize, calculateSliceMD5）
 * 已迁移到 @123pan/core 包中，请从那里导入。
 *
 * 此文件保留仅为向后兼容，建议直接使用 @123pan/core 中的函数。
 */

// 重新导出 core 包中的文件工具函数
export { calculateMD5, sliceFile, getFileSize, calculateSliceMD5 } from '@123pan/core'

import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

/**
 * 流式计算文件 MD5（不将整个文件读入内存，支持超大文件）
 */
export async function calculateFileMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * 读取文件的指定区间（按分片读取，内存占用仅为分片大小）
 */
export async function readFileRange(
  filePath: string,
  start: number,
  length: number
): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(length)
    let read = 0
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, start + read)
      if (bytesRead <= 0) break
      read += bytesRead
    }
    return read === length ? buffer : buffer.subarray(0, read)
  } finally {
    await handle.close()
  }
}

/** 读取文件大小（字节） */
export async function getFilePathSize(filePath: string): Promise<number> {
  return (await stat(filePath)).size
}
