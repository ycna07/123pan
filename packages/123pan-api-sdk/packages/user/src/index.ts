/**
 * 用户管理模块
 */

import { HttpClient } from '@123pan/core';
import type { ApiResponse, UserInfo } from '@123pan/core';

interface NormalUserInfo {
  UID?: number;
  Nickname?: string;
  HeadImage?: string;
  Passport?: string;
  Mail?: string;
  SpaceUsed?: number;
  SpacePermanent?: number;
  SpaceTemp?: number;
  SpaceTempExpr?: string;
  Vip?: boolean;
  VipExplain?: string;
  DirectTraffic?: number;
  HTTPSCount?: number;
}

export class UserModule {
  constructor(private httpClient: HttpClient) {}

  /**
   * 获取用户信息
   * 普通用户 API 返回 PascalCase 字段，这里会映射为 SDK 的 UserInfo。
   */
  async getUserInfo(): Promise<ApiResponse<UserInfo>> {
    const result = await this.httpClient.get<NormalUserInfo>('/api/user/info');
    const raw = result.data || {};
    const passport = raw.Passport??"";
    if (raw.UID === undefined) {
      throw new Error('UID is required');
    }
    return {
      ...result,
      data: {
        uid: raw.UID,
        nickname: raw.Nickname || '',
        ...(raw.HeadImage !== undefined && { headImage: raw.HeadImage }),
        ...(passport !== undefined && { passport }),
        ...(raw.Mail !== undefined && { mail: raw.Mail }),
        spaceUsed: raw.SpaceUsed??-1,
        spacePermanent: raw.SpacePermanent??-1,
        spaceTemp: raw.SpaceTemp??-1,
        spaceTempExpr: raw.SpaceTempExpr || '',
        vip: raw.Vip??false,
        ...(raw.VipExplain !== undefined && { vipLabel: raw.VipExplain }),
        directTraffic: raw.DirectTraffic??-1,
        httpsCount: raw.HTTPSCount??-1,
      },
    };
  }
}
