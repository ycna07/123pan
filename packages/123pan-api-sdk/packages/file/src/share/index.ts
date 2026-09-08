/**
 * 文件分享模块
 */

import { HttpClient } from '@123pan/core'
import type { ApiResponse } from '@123pan/core'
import type {
  CreateShareParams,
  CreateShareResponse,
  CreatePaidShareParams,
  CreatePaidShareResponse
} from './types'

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

function mapShareData(data: any): CreateShareResponse {
  const shareID = data?.ShareID ?? data?.shareID ?? data?.shareId ?? data?.ID ?? data?.id ?? 0
  const shareKey = data?.ShareKey ?? data?.shareKey ?? data?.key ?? ''
  return {
    shareID: Number(shareID),
    shareKey: String(shareKey)
  }
}
