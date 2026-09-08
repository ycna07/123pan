import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import axios from 'axios'
import Pan123SDK from '../index'
import { futureExp, makeJwt } from '../../../core/src/auth/__tests__/jwt-factory'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
}))

const mockCreate = axios.create as unknown as Mock

let httpClientMock: {
  get: Mock
  interceptors: { request: { use: Mock }; response: { use: Mock } }
}

beforeEach(() => {
  httpClientMock = {
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
  mockCreate.mockReset().mockImplementation(() => httpClientMock)
})

describe('Pan123SDK 扫码登录透传', () => {
  it('createQrLogin / pollQrLogin 透传 AuthManager 并在成功后写入 token', async () => {
    const exp = futureExp(3600)
    const jwt = makeJwt({ exp })
    httpClientMock.get
      .mockResolvedValueOnce({
        data: {
          code: 0,
          message: 'ok',
          data: { uniID: 'uni-1', url: 'https://yun.123pan.cn/wx-app-login.html' }
        }
      })
      .mockResolvedValueOnce({
        data: { code: 200, message: 'ok', data: { loginStatus: 3, token: jwt } }
      })

    const sdk = new Pan123SDK({
      cacheConfig: { enabled: false },
      loggerConfig: { enableConsole: false }
    })

    const session = await sdk.createQrLogin()
    expect(session).toEqual({
      uniID: 'uni-1',
      qrUrl:
        'https://yun.123pan.cn/wx-app-login.html?env=production&uniID=uni-1&source=123pan&type=login'
    })

    const result = await sdk.pollQrLogin('uni-1')
    expect(result).toEqual({ status: 'success', token: jwt })

    const info = await sdk.getTokenInfo()
    expect(info?.accessToken).toBe(jwt)
    expect(info?.expiresAt).toBe(exp * 1000)
  })
})
