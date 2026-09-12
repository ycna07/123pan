/**
 * 分享模块类型定义
 */

import type { ApiResponse } from '@123pan/core'

/** 分享有效期天数（枚举值） */
export type ShareExpireDays = 0 | 1 | 7 | 30

/** 分享提取流量包开关 */
export type TrafficSwitch = 1 | 2 | 3 | 4
// 1: 全部关闭
// 2: 打开游客免登录提取
// 3: 打开超流量用户提取
// 4: 全部开启

/** 分享提取流量包流量限制开关 */
export type TrafficLimitSwitch = 1 | 2
// 1: 关闭限制
// 2: 打开限制

/** 创建分享链接参数 */
export interface CreateShareParams {
  /** 分享链接名称 */
  shareName: string
  /** 分享链接有效期天数，枚举值：1、7、30、0（0代表永久） */
  shareExpire: ShareExpireDays
  /** 分享文件ID列表，支持数组或逗号分割的字符串，最多100个 */
  fileIDList: (number | string)[] | string
  /** 分享链接提取码（选填） */
  sharePwd?: string
  /** 分享提取流量包开关（选填） */
  trafficSwitch?: TrafficSwitch
  /** 分享提取流量包流量限制开关（选填） */
  trafficLimitSwitch?: TrafficLimitSwitch
  /** 分享提取流量包限制流量，单位：字节（选填） */
  trafficLimit?: number
}

/** 创建分享链接响应 */
export interface CreateShareResponse {
  /** 分享ID */
  shareID: number
  /** 分享码，需要拼接到 https://www.123pan.com/s/ 后面访问 */
  shareKey: string
}

/** 创建付费分享链接参数 */
export interface CreatePaidShareParams {
  /** 分享链接名称，要小于35个字符且不能包含特殊字符 */
  shareName: string
  /** 分享文件ID列表，支持数组或逗号分割的字符串，最多100个 */
  fileIDList: (number | string)[] | string
  /** 付费金额，最小1元，最大1000元 */
  payAmount: number
  /** 是否开启打赏（选填）：0-否，1-是 */
  isReward?: 0 | 1
  /** 资源描述（选填） */
  resourceDesc?: string
  /** 分享提取流量包开关（选填） */
  trafficSwitch?: TrafficSwitch
  /** 分享提取流量包流量限制开关（选填） */
  trafficLimitSwitch?: TrafficLimitSwitch
  /** 分享提取流量包限制流量，单位：字节（选填） */
  trafficLimit?: number
}

/** 创建付费分享链接响应 */
export interface CreatePaidShareResponse {
  /** 分享ID */
  shareID: number
  /** 分享码，需要拼接到 https://www.123pan.com/ps/ 后面访问 */
  shareKey: string
}

/** 分享中的文件条目 */
export interface ShareFileItem {
  fileId: number
  filename: string
  /** 0-文件 1-文件夹 */
  type: number
  size: number
  etag: string
  s3KeyFlag?: string
  storageNode?: string
  parentFileId: number
  updateAt?: string
}

/** 获取分享文件列表参数 */
export interface GetShareFilesParams {
  /** 分享码 */
  shareKey: string
  /** 提取码（不区分大小写） */
  sharePwd?: string
  /** 父目录 id（分享内的目录），默认 0 */
  parentFileId?: number
  /** 页码，默认 1 */
  page?: number
  /** 分页大小，最多 100 */
  limit?: number
}

/** 获取分享文件列表响应 */
export interface GetShareFilesResponse {
  lastFileId: number
  fileList: ShareFileItem[]
}

/** 转存分享参数 */
export interface TransferShareParams {
  shareKey: string
  sharePwd?: string
  files: ShareFileItem[]
  /** 转存到的目标目录 id（自己的网盘），根目录为 0 */
  targetParentId: number
}

/** 分享列表中单条分享 */
export interface ShareListItem {
  /** 分享 id */
  ShareId: number
  /** 分享码（短链后缀） */
  ShareKey: string
  /** 分享名称 */
  ShareName: string
  /** 提取码，空字符串表示无提取码 */
  SharePwd: string
  /** 过期时间（ISO 字符串） */
  Expiration: string
  /** 是否已过期 */
  Expired: boolean
  /** 创建时间（ISO 字符串） */
  CreateAt: string
  /** 浏览次数 */
  PreviewCount: number
  /** 下载次数 */
  DownloadCount: number
  /** 转存次数 */
  SaveCount: number
  /** 分享的文件 id 列表（逗号分隔） */
  FileIdList: string
  /** 分享链接 */
  shareLinkList?: { list?: string[]; standBy?: string }
}

/** 获取我的分享列表响应 */
export interface GetShareListResponse {
  /** -1 表示最后一页 */
  Next: string | number
  /** 分享列表 */
  InfoList: ShareListItem[]
}
