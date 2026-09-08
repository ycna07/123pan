/**
 * 直链空间管理模块
 */

import { HttpClient } from '@123pan/core'
import type { ApiResponse } from '@123pan/core'
import type {
  EnableDirectLinkParams,
  EnableDirectLinkResponse,
  DisableDirectLinkParams,
  DisableDirectLinkResponse,
  GetDirectLinkUrlParams,
  GetDirectLinkUrlResponse
} from './types'

export class SpaceModule {
  constructor(private httpClient: HttpClient) {}

  /**
   * 启用直链空间
   * 为指定的文件夹启用直链空间功能
   * @param params 启用参数
   * @param params.fileID 启用直链空间的文件夹的fileID
   * @returns 成功启用的文件夹名称
   */
  async enable(params: EnableDirectLinkParams): Promise<ApiResponse<EnableDirectLinkResponse>> {
    const { fileID } = params

    // 验证 fileID
    if (!fileID || fileID <= 0) {
      throw new Error('fileID 必须是有效的正整数')
    }

    const result = await this.httpClient.post<any>('/api/cdn-link/enable', {
      fileID
    })
    return { ...result, data: mapFilename(result.data) }
  }

  /**
   * 禁用直链空间
   * 为指定的文件夹禁用直链空间功能
   * @param params 禁用参数
   * @param params.fileID 禁用直链空间的文件夹的fileID
   * @returns 成功禁用的文件夹名称
   */
  async disable(params: DisableDirectLinkParams): Promise<ApiResponse<DisableDirectLinkResponse>> {
    const { fileID } = params

    // 验证 fileID
    if (!fileID || fileID <= 0) {
      throw new Error('fileID 必须是有效的正整数')
    }

    const result = await this.httpClient.post<any>('/api/cdn-link/disable', {
      fileID
    })
    return { ...result, data: mapFilename(result.data) }
  }

  /**
   * 获取直链链接
   * 获取指定文件的直链URL
   * @param params 查询参数
   * @param params.fileID 需要获取直链链接的文件的fileID
   * @returns 文件对应的直链链接
   */
  async getUrl(params: GetDirectLinkUrlParams): Promise<ApiResponse<GetDirectLinkUrlResponse>> {
    const { fileID } = params

    // 验证 fileID
    if (!fileID || fileID <= 0) {
      throw new Error('fileID 必须是有效的正整数')
    }

    const result = await this.httpClient.get<any>('/api/cdn-link/url', {
      fileID
    })
    const url = result.data?.url || result.data?.URL || result.data
    if (typeof url !== 'string' || !url) {
      throw new Error('直链响应中没有有效 URL')
    }
    return { ...result, data: { url } }
  }

  /**
   * 直链缓存刷新
   * 刷新直链的缓存，使更新的配置立即生效
   * @returns 刷新结果
   */
  async refreshCache(): Promise<ApiResponse<{}>> {
    return this.httpClient.post<{}>('/api/restful/goapi/v1/cdnLink/cache/refresh', {})
  }
}

function mapFilename(data: any): EnableDirectLinkResponse {
  if (typeof data === 'string') {
    return { filename: data }
  }
  return { filename: data?.filename || data?.FileName || '' }
}
