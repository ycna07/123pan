/**
 * 文件上传模块（普通用户 API）
 */

import { HttpClient } from '@123pan/core'
import type { ApiResponse } from '@123pan/core'
import axios, { AxiosProgressEvent } from 'axios'
import type {
  ICreateFolderResponse,
  ICreateFileResponse,
  IUploadSliceResponse,
  IUploadCompleteResponse,
  IGetUploadDomainResponse,
  ISingleUploadResponse,
  IUploadFileParams,
  IUploadFileResult,
  IUploadSession
} from './types'
import {
  calculateMD5,
  calculateFileMD5,
  getFileSize,
  getFilePathSize,
  readFileRange
} from './utils'

interface UploadRequestData {
  Reuse?: boolean
  SliceSize?: number | string
  Bucket?: string
  Key?: string
  StorageNode?: string
  UploadId?: string
  FileId?: number | string
  FileID?: number | string
  Info?: {
    FileId?: number | string
    FileID?: number | string
  }
}

interface UploadPrepareData {
  presignedUrls?: Record<string, string>
}

interface UploadCompleteData {
  completed?: boolean
  Completed?: boolean
  FileId?: number | string
  FileID?: number | string
  fileId?: number | string
}

interface UploadContext {
  FileId: number
  bucket: string
  key: string
  storageNode: string
  uploadId: string
}

export class UploadModule {
  constructor(private httpClient: HttpClient) {}

  /**
   * 创建目录
   */
  async createFolder(params: {
    /** 目录名(注:不能重名) */
    name: string
    /** 父目录id，上传到根目录时填写 0 */
    parentID: number
    /** 同名目录处理策略：1 保留两者（返回新目录id）；0 报错 */
    duplicate?: number
  }): Promise<ApiResponse<ICreateFolderResponse>> {
    const result = await this.httpClient.post<UploadRequestData>('/api/file/upload_request', {
      fileName: params.name,
      parentFileId: params.parentID,
      driveId: 0,
      duplicate: params.duplicate ?? 0,
      etag: '',
      size: 0,
      type: 1,
      NotReuse: false
    })

    const dirID = extractFileID(result.data)
    if (!dirID) {
      throw new Error('创建目录失败：响应中没有文件 ID')
    }

    return {
      ...result,
      data: { dirID }
    }
  }

  /**
   * 创建上传任务。普通 API 通过返回的 S3 元数据继续上传。
   */
  async createFile(params: {
    parentFileID: number
    filename: string
    etag: string
    size: number
    duplicate?: number
    containDir?: boolean
  }): Promise<ApiResponse<ICreateFileResponse>> {
    if (params.containDir) {
      throw new Error('普通用户 API 不支持 containDir，请先创建目录后仅传入文件名')
    }

    const result = await this.httpClient.post<UploadRequestData>('/api/file/upload_request', {
      fileName: params.filename,
      parentFileId: params.parentFileID,
      driveId: 0,
      duplicate: params.duplicate || 0,
      etag: params.etag,
      size: params.size,
      type: 0,
      NotReuse: false
    })

    const fileID = extractFileID(result.data)
    return {
      ...result,
      data: {
        ...(fileID ? { fileID } : {}),
        ...(params.etag && params.size ? { preuploadID: String(result.data?.UploadId || '') } : {}),
        reuse: result.data?.Reuse === true,
        sliceSize: Number(result.data?.SliceSize || 0),
        servers: []
      }
    }
  }

  /**
   * @deprecated 普通用户 API 使用 S3 预签名 URL，与 Open API 的上传域名接口不兼容。
   * 请使用 uploadFile。
   */
  async uploadSlice(): Promise<ApiResponse<IUploadSliceResponse>> {
    throw new Error('普通用户 API 不支持 uploadSlice；请使用 uploadFile')
  }

  /**
   * @deprecated 普通 API 的完成接口需要 upload_request 返回的完整 S3 上下文。
   * 请使用 uploadFile。
   */
  async uploadComplete(): Promise<ApiResponse<IUploadCompleteResponse>> {
    throw new Error('普通用户 API 不支持单独调用 uploadComplete；请使用 uploadFile')
  }

  /**
   * @deprecated 普通用户 API 没有独立的上传结果查询接口。
   * 请使用 uploadFile。
   */
  async queryUploadResult(): Promise<ApiResponse<IUploadCompleteResponse>> {
    throw new Error('普通用户 API 不支持 queryUploadResult；请使用 uploadFile')
  }

  /**
   * @deprecated 普通用户 API 使用 S3 预签名 URL，不返回上传域名。
   * 请使用 uploadFile。
   */
  async getUploadDomain(): Promise<ApiResponse<IGetUploadDomainResponse>> {
    throw new Error('普通用户 API 不支持 getUploadDomain；请使用 uploadFile')
  }

  /**
   * @deprecated 普通用户 API 不支持 Open API 的单步上传接口。
   * 请使用 uploadFile。
   */
  async singleUpload(): Promise<ApiResponse<ISingleUploadResponse>> {
    throw new Error('普通用户 API 不支持 singleUpload；请使用 uploadFile')
  }

  /**
   * 高级上传方法：一键上传文件。
   * 普通用户 API 会自动选择单分片或多分片 S3 上传流程。
   * containDir、useSingleUpload 和 asyncMode 在普通用户 API 中没有对应能力，会被忽略。
   */
  async uploadFile(params: IUploadFileParams): Promise<IUploadFileResult> {
    const {
      filename,
      file,
      filePath,
      etag,
      parentFileID = 0,
      onProgress,
      duplicate,
      signal,
      resumeSession,
      completedParts,
      onSession,
      onPartComplete
    } = params

    if (!file && !filePath) {
      throw new Error('缺少上传数据：请提供 file 或 filePath')
    }
    const fileSize = filePath ? await getFilePathSize(filePath) : getFileSize(file as Buffer)
    signal?.throwIfAborted()

    let context: UploadContext
    let sliceSize: number
    let isMultipart: boolean
    let session: IUploadSession
    let fileID: number | undefined

    if (resumeSession) {
      fileID = resumeSession.FileId
      // 续传：沿用已保存的会话，跳过 upload_request 与 md5 计算
      context = {
        FileId: resumeSession.FileId,
        bucket: resumeSession.bucket,
        key: resumeSession.key,
        storageNode: resumeSession.storageNode,
        uploadId: resumeSession.uploadId
      }
      sliceSize = resumeSession.sliceSize
      isMultipart = resumeSession.isMultipart
      session = resumeSession
    } else {
      let fileMd5 = etag
      if (!fileMd5) {
        fileMd5 = filePath ? await calculateFileMD5(filePath) : await calculateMD5(file as Buffer)
      }

      const createResult = await this.httpClient.post<UploadRequestData>(
        '/api/file/upload_request',
        {
          fileName: filename,
          parentFileId: parentFileID,
          driveId: 0,
          duplicate: duplicate || 0,
          etag: fileMd5,
          size: fileSize,
          type: 0,
          NotReuse: false
        }
      )

      const uploadData = createResult.data
      fileID = extractFileID(uploadData)
      if (uploadData.Reuse) {
        if (onProgress) {
          reportProgress(onProgress, fileSize, fileSize)
        }
        if (!fileID) {
          throw new Error('秒传成功但响应中没有文件 ID')
        }
        return {
          fileID,
          isReuse: true,
          isSingleUpload: false
        }
      }

      sliceSize = Number(uploadData.SliceSize || 0)
      if (
        !sliceSize ||
        !uploadData.Bucket ||
        !uploadData.Key ||
        !uploadData.StorageNode ||
        !uploadData.UploadId
      ) {
        throw new Error('上传初始化失败：缺少 S3 上传上下文')
      }

      context = {
        FileId: fileID || 0,
        bucket: uploadData.Bucket,
        key: uploadData.Key,
        storageNode: uploadData.StorageNode,
        uploadId: uploadData.UploadId
      }
      isMultipart = fileSize > sliceSize
      session = {
        FileId: context.FileId,
        bucket: context.bucket,
        key: context.key,
        storageNode: context.storageNode,
        uploadId: context.uploadId,
        sliceSize,
        totalParts: isMultipart ? Math.ceil(fileSize / sliceSize) : 1,
        isMultipart
      }
      onSession?.(session)
    }

    // 按需读取分片：filePath 模式下每个分片独立从磁盘读取，内存占用仅为分片大小
    const bufferSource = file ? toBuffer(file) : null
    const totalParts = isMultipart ? Math.ceil(fileSize / sliceSize) : 1
    const getPartData = async (index: number): Promise<Buffer> => {
      const start = index * sliceSize
      const length = Math.min(sliceSize, fileSize - start)
      if (filePath) return readFileRange(filePath, start, length)
      return (bufferSource as Buffer).subarray(start, start + length)
    }
    const alreadyDone = new Set(completedParts ?? [])
    const bytesOfPart = (partNumber: number): number =>
      Math.min(sliceSize, fileSize - (partNumber - 1) * sliceSize)
    if (alreadyDone.size > 0 && onProgress) {
      const resumedBytes = [...alreadyDone].reduce((sum, part) => sum + bytesOfPart(part), 0)
      reportProgress(onProgress, resumedBytes, fileSize)
    }

    for (let index = 0; index < totalParts; index++) {
      const sliceNo = index + 1
      signal?.throwIfAborted()
      if (alreadyDone.has(sliceNo)) {
        continue
      }
      const slice = await getPartData(index)
      let presignedUrl: string

      if (isMultipart) {
        const prepare = await this.httpClient.post<UploadPrepareData>(
          '/api/file/s3_repare_upload_parts_batch',
          {
            ...context,
            partNumberStart: sliceNo,
            partNumberEnd: sliceNo + 1
          }
        )
        presignedUrl = prepare.data.presignedUrls?.[String(sliceNo)] || ''
      } else {
        const auth = await this.httpClient.post<UploadPrepareData>(
          '/api/file/s3_upload_object/auth',
          context
        )
        presignedUrl = auth.data.presignedUrls?.['1'] || ''
      }

      if (!presignedUrl) {
        throw new Error(`上传失败：未获取到第 ${sliceNo} 个分片的预签名地址`)
      }

      await axios.put(presignedUrl, slice, {
        signal,
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (onProgress && event.total) {
            const completedBytes = index * sliceSize + event.loaded
            reportProgress(
              onProgress,
              Math.min(completedBytes, fileSize),
              fileSize,
              sliceNo,
              totalParts
            )
          }
        }
      })

      if (onProgress) {
        reportProgress(
          onProgress,
          Math.min((index + 1) * sliceSize, fileSize),
          fileSize,
          sliceNo,
          totalParts
        )
      }
      onPartComplete?.(sliceNo)
    }

    const complete = await this.httpClient.post<UploadCompleteData>(
      '/api/file/upload_complete/v2',
      {
        FileId: context.FileId,
        bucket: context.bucket,
        key: context.key,
        storageNode: context.storageNode,
        uploadId: context.uploadId,
        isMultipart
      }
    )

    const completed = complete.data.completed ?? complete.data.Completed ?? true
    const completedFileID =
      toNumber(complete.data.FileID ?? complete.data.FileId ?? complete.data.fileId) || fileID
    if (!completed || !completedFileID) {
      throw new Error('上传完成失败：服务端未确认文件')
    }

    if (onProgress) {
      reportProgress(onProgress, fileSize, fileSize)
    }

    return {
      fileID: completedFileID,
      isReuse: false,
      isSingleUpload: !isMultipart,
      isAsync: false,
      session
    }
  }
}

function extractFileID(data: UploadRequestData | undefined): number | undefined {
  const value = data?.Info?.FileID ?? data?.Info?.FileId ?? data?.FileID ?? data?.FileId
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toBuffer(file: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(file)) {
    return file
  }
  if (file instanceof Uint8Array) {
    return Buffer.from(file)
  }
  if (file instanceof ArrayBuffer) {
    return Buffer.from(file)
  }
  throw new Error('Unsupported file type. Expected Buffer, Uint8Array, or ArrayBuffer.')
}

function reportProgress(
  callback: NonNullable<IUploadFileParams['onProgress']>,
  loaded: number,
  total: number,
  currentSlice?: number,
  totalSlices?: number
): void {
  callback({
    loaded,
    total,
    percent: total > 0 ? Math.min((loaded / total) * 100, 100) : 100,
    ...(currentSlice !== undefined && { currentSlice }),
    ...(totalSlices !== undefined && { totalSlices })
  })
}

// 导出类型
export * from './types'
