/**
 * 文件分享模块
 */

import { HttpClient } from '@123pan/core'
import type { ApiResponse } from '@123pan/core'
import type {
  CreateShareParams,
  CreateShareResponse,
  CreatePaidShareParams,
  CreatePaidShareResponse,
  GetShareFilesParams,
  GetShareFilesResponse,
  ShareFileItem,
  TransferShareParams
} from './types'

const SHARE_LINK_HOSTS = ['www.123pan.com', '123pan.com', 'www.123pan.cn', '123pan.cn', 'www.123684.com', 'www.123865.com', 'www.123912.com']
const SHARE_KEY_PATTERN = /[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}/

/**
 * 从分享链接或文本中解析分享码与提取码
 * 支持：https://www.123pan.com/s/<shareKey>?pwd=xxxx、裸分享码、含提取码说明的文本
 */
export function parseShareLink(input: string): { shareKey: string; sharePwd?: string } {
  const text = input.trim()
  if (!text) throw new Error('请输入分享链接或分享码')

  const urlMatch = text.match(/https?:\/\/[^\s]+/i)
  const source = urlMatch ? urlMatch[0] : text

  let shareKey = ''
  const pathMatch = source.match(/\/(?:s|ps)\/([A-Za-z0-9-]+)/i)
  if (pathMatch) {
    shareKey = pathMatch[1]
  } else {
    const keyMatch = source.match(SHARE_KEY_PATTERN)
    if (keyMatch) shareKey = keyMatch[0]
  }
  if (!shareKey) {
    // 兼容无短横线的分享码（https://www.123pan.com/s/xxxx 或纯码）
    const bare = source.replace(/https?:\/\/\S+/i, '').trim()
    if (/^[A-Za-z0-9]{4,}$/.test(bare)) shareKey = bare
  }
  if (!shareKey) throw new Error('未能从内容中识别分享码')

  let sharePwd: string | undefined
  const pwdMatch =
    text.match(/[?&]pwd=([A-Za-z0-9]+)/i) ||
    text.match(/提取码[:：\s]*([A-Za-z0-9]{4,})/i) ||
    text.match(/密码[:：\s]*([A-Za-z0-9]{4,})/i)
  if (pwdMatch) sharePwd = pwdMatch[1]

  void SHARE_LINK_HOSTS
  return sharePwd ? { shareKey, sharePwd } : { shareKey }
}

export class ShareModule {
  constructor(private httpClient: HttpClient) {}

  /**
   * 创建分享链接
   * @param params 创建分享参数
   * @param params.shareName 分享链接名称
   * @param params.shareExpire 分享链接有效期天数（1、7、30、0，0代表永久）
   * @param params.fileIDList 分享文件ID列表，支持数组或逗号分割的字符串，最多100个
   * @param params.sharePwd 分享链接提取码（选填）
   * @param params.trafficSwitch 分享提取流量包开关（选填）
   * @param params.trafficLimitSwitch 分享提取流量包流量限制开关（选填）
   * @param params.trafficLimit 分享提取流量包限制流量，单位：字节（选填）
   * @returns 分享信息（包含分享ID和分享码）
   */
  async createShare(params: CreateShareParams): Promise<ApiResponse<CreateShareResponse>> {
    const fileIDListStr = normalizeFileIDs(params.fileIDList)
    if (![0, 1, 7, 30].includes(params.shareExpire)) {
      throw new Error('shareExpire 必须是 0、1、7 或 30 之一')
    }

    const result = await this.httpClient.post<any>('/api/share/create', {
      fileIdList: fileIDListStr,
      displayStatus: 2,
      driveId: 0,
      event: 'shareCreate',
      expiration: toExpiration(params.shareExpire),
      fillPwdSwitch: 1,
      isPayShare: false,
      isReward: 0,
      payAmount: 0,
      renameVisible: false,
      resourceDesc: '',
      shareName: params.shareName,
      sharePwd: params.sharePwd || '',
      trafficLimit: params.trafficLimit || 0,
      trafficLimitSwitch: params.trafficLimitSwitch || 1,
      trafficSwitch: params.trafficSwitch || 1
    })

    return {
      ...result,
      data: mapShareData(result.data)
    }
  }

  /**
   * 创建付费分享链接
   * @param params 创建付费分享参数
   * @param params.shareName 分享链接名称，要小于35个字符且不能包含特殊字符
   * @param params.fileIDList 分享文件ID列表，支持数组或逗号分割的字符串，最多100个
   * @param params.payAmount 付费金额，最小1元，最大1000元
   * @param params.isReward 是否开启打赏（选填）：0-否，1-是
   * @param params.resourceDesc 资源描述（选填）
   * @param params.trafficSwitch 分享提取流量包开关（选填）
   * @param params.trafficLimitSwitch 分享提取流量包流量限制开关（选填）
   * @param params.trafficLimit 分享提取流量包限制流量，单位：字节（选填）
   * @returns 分享信息（包含分享ID和分享码）
   */
  async createPaidShare(
    params: CreatePaidShareParams
  ): Promise<ApiResponse<CreatePaidShareResponse>> {
    // 验证 shareName 长度（小于35个字符）
    if (params.shareName.length >= 35) {
      throw new Error('分享链接名称要小于35个字符')
    }

    // 处理 fileIDList：如果是数组，转换为逗号分割的字符串
    const fileIDListStr = normalizeFileIDs(params.fileIDList)

    // 验证 payAmount（1-1000元）
    if (!Number.isInteger(params.payAmount) || params.payAmount < 1 || params.payAmount > 1000) {
      throw new Error('付费金额必须是1-1000之间的整数')
    }

    const result = await this.httpClient.post<any>('/api/share/create', {
      fileIdList: fileIDListStr,
      displayStatus: 2,
      driveId: 0,
      event: 'shareCreate',
      expiration: toExpiration(0),
      fillPwdSwitch: 1,
      isPayShare: true,
      isReward: params.isReward || 0,
      payAmount: params.payAmount * 100,
      renameVisible: false,
      resourceDesc: params.resourceDesc || '',
      shareName: params.shareName,
      sharePwd: '',
      trafficLimit: params.trafficLimit || 0,
      trafficLimitSwitch: params.trafficLimitSwitch || 1,
      trafficSwitch: params.trafficSwitch || 1
    })

    return {
      ...result,
      data: mapShareData(result.data)
    }
  }

  /**
   * 获取分享中的文件列表（解析分享链接）
   * @param params 查询参数
   * @returns 文件列表（Next 为 -1 表示最后一页）
   */
  async getShareFiles(
    params: GetShareFilesParams
  ): Promise<ApiResponse<GetShareFilesResponse>> {
    const { shareKey, sharePwd, parentFileId = 0, page = 1, limit = 100 } = params
    if (!shareKey) throw new Error('缺少分享码')
    const query: Record<string, unknown> = {
      ShareKey: shareKey,
      limit: Math.min(limit, 100),
      next: 0,
      orderBy: 'file_name',
      orderDirection: 'asc',
      Page: page,
      parentFileId,
      event: 'homeListFile'
    }
    if (sharePwd) query.SharePwd = sharePwd

    const result = await this.httpClient.get<{ Next?: unknown; InfoList?: any[] }>(
      '/api/share/get',
      query
    )
    return {
      ...result,
      data: {
        lastFileId: toNumber(result.data?.Next, -1),
        fileList: (result.data?.InfoList ?? []).map(mapShareFileItem)
      }
    }
  }

  /**
   * 获取分享中文件的下载信息
   * @param params.shareKey 分享码
   * @param params.sharePwd 提取码（选填）
   * @param params.file 分享文件条目（需含 etag/size 等）
   * @returns 下载地址
   */
  async getShareDownloadInfo(params: {
    shareKey: string
    sharePwd?: string
    file: Pick<ShareFileItem, 'fileId' | 'etag' | 'size'> & { s3KeyFlag?: string }
  }): Promise<ApiResponse<{ downloadUrl: string }>> {
    const { shareKey, sharePwd, file } = params
    const result = await this.httpClient.post<any>(
      '/api/share/download/info',
      {
        ShareKey: shareKey,
        SharePwd: sharePwd ?? '',
        Etag: file.etag,
        S3KeyFlag: file.s3KeyFlag ?? '',
        FileID: file.fileId,
        Size: file.size,
        DriveId: 0
      },
      { headers: { platform: 'android' } }
    )
    const url = result.data?.DownloadURL || result.data?.DownloadUrl || result.data?.downloadUrl
    if (typeof url !== 'string' || !url) {
      throw new Error('分享下载信息响应中没有有效地址')
    }
    return { ...result, data: { downloadUrl: toDirectDownloadUrl(url) } }
  }

  /**
   * 转存分享文件到自己的网盘
   * @param params 转存参数
   * @returns 任务响应（taskId/mode）
   */
  async transferShare(
    params: TransferShareParams
  ): Promise<ApiResponse<{ taskId: number; mode: number } | null>> {
    const { shareKey, sharePwd, files, targetParentId } = params
    if (!shareKey) throw new Error('缺少分享码')
    if (!files.length) throw new Error('请选择要转存的文件')
    const result = await this.httpClient.post<{ taskId?: number; task_id?: number; mode?: number }>(
      '/api/file/copy/async',
      {
        current_level: 1,
        event: 'transfer',
        share_key: shareKey,
        share_pwd: sharePwd ?? '',
        file_list: files.map((file) => ({
          drive_id: 0,
          file_id: file.fileId,
          file_name: file.filename,
          etag: file.etag,
          size: file.size,
          type: file.type,
          ...(file.s3KeyFlag && { s3_key_flag: file.s3KeyFlag }),
          ...(file.storageNode && { storage_node: file.storageNode }),
          parent_file_id: targetParentId
        }))
      }
    )
    const data = result.data
    return {
      ...result,
      data: data
        ? { taskId: Number(data.taskId ?? data.task_id ?? 0), mode: Number(data.mode ?? 0) }
        : null
    }
  }
}

// 导出类型
export * from './types'

function normalizeFileIDs(value: (number | string)[] | string): string {
  const ids = Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
  if (ids.length > 100) {
    throw new Error('文件ID列表最多支持100个文件')
  }
  return ids.join(',')
}

function toExpiration(days: 0 | 1 | 7 | 30): string {
  if (days === 0) {
    return '9999-12-31T23:59:59+08:00'
  }
  const time = new Date(Date.now() + days * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000)
  return `${time.toISOString().slice(0, 19)}+08:00`
}

/**
 * 分享下载地址可能是 web-pro2.123952.com/download-v2/?params=<base64> 包装页，
 * 其中 params 是真实 CDN 直链的 base64 编码，这里解包为直链
 */
function toDirectDownloadUrl(url: string): string {
  try {
    const params = new URL(url).searchParams.get('params')
    if (!params) return url
    const normalized = params.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    return /^https?:\/\//.test(decoded) ? decoded : url
  } catch {
    return url
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapShareFileItem(raw: any): ShareFileItem {
  return {
    fileId: toNumber(raw?.FileId ?? raw?.FileID),
    filename: String(raw?.FileName ?? ''),
    type: toNumber(raw?.Type),
    size: toNumber(raw?.Size),
    etag: String(raw?.Etag ?? ''),
    ...(raw?.S3KeyFlag !== undefined && { s3KeyFlag: String(raw.S3KeyFlag) }),
    ...(raw?.StorageNode !== undefined && { storageNode: String(raw.StorageNode) }),
    parentFileId: toNumber(raw?.ParentFileId),
    ...(raw?.UpdateAt !== undefined && { updateAt: String(raw.UpdateAt) })
  }
}

function mapShareData(data: any): CreateShareResponse {
  const shareID = data?.ShareID ?? data?.shareID ?? data?.shareId ?? data?.ID ?? data?.id ?? 0
  const shareKey = data?.ShareKey ?? data?.shareKey ?? data?.key ?? ''
  return {
    shareID: Number(shareID),
    shareKey: String(shareKey)
  }
}
