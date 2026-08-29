import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import axios from "axios";
import { AuthManager } from "../auth-manager";
import type { SdkConfig } from "../../types";
import { futureExp, makeJwt, pastExp } from "./jwt-factory";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

const mockCreate = axios.create as unknown as Mock;
const mockPost = axios.post as unknown as Mock;

let httpClientMock: {
  get: Mock;
  post: Mock;
  interceptors: { request: { use: Mock }; response: { use: Mock } };
};

const baseConfig: SdkConfig = {
  cacheConfig: { enabled: false },
  loggerConfig: { enableConsole: false },
};

function sign_inResponse(token: string): { data: { code: number; message: string; data: { token: string } } } {
  return { data: { code: 0, message: "ok", data: { token } } };
}

beforeEach(() => {
  httpClientMock = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  mockCreate.mockReset().mockImplementation(() => httpClientMock);
  mockPost.mockReset();
});

describe("直接 token 认证", () => {
  it("构造时解析 JWT exp 作为过期时间", () => {
    const exp = futureExp(7200);
    const auth = new AuthManager({ ...baseConfig, token: makeJwt({ exp }) });

    const info = auth.getTokenInfo();
    expect(info?.accessToken).toBe(makeJwt({ exp }));
    expect(info?.expiresAt).toBe(exp * 1000);
  });

  it("剥离 Bearer 前缀", () => {
    const jwt = makeJwt({ exp: futureExp() });
    const auth = new AuthManager({ ...baseConfig, token: `Bearer ${jwt}` });

    expect(auth.getTokenInfo()?.accessToken).toBe(jwt);
  });

  it("非 JWT token 回退 30 天有效期", () => {
    const before = Date.now();
    const auth = new AuthManager({ ...baseConfig, token: "plain-token" });

    const expiresAt = auth.getTokenInfo()?.expiresAt ?? 0;
    const month = 30 * 24 * 3600 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + month - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + month + 1000);
  });

  it("token 过期且无其他凭证时刷新报认证配置无效", async () => {
    const auth = new AuthManager({ ...baseConfig, token: makeJwt({ exp: pastExp() }) });

    await expect(auth.getAccessToken()).rejects.toThrow(/认证配置无效/);
  });

  it("token 过期时通过账号密码重新登录", async () => {
    const newJwt = makeJwt({ exp: futureExp() });
    mockPost.mockResolvedValue(sign_inResponse(newJwt));
    const auth = new AuthManager({
      ...baseConfig,
      token: makeJwt({ exp: pastExp() }),
      passport: "13800000000",
      password: "secret",
    });

    await expect(auth.getAccessToken()).resolves.toBe(newJwt);
  });
});

describe("账号密码登录", () => {
  it("sign_in 请求携带正确的地址、负载与请求头", async () => {
    mockPost.mockResolvedValue(sign_inResponse(makeJwt({ exp: futureExp() })));
    const auth = new AuthManager({ ...baseConfig, passport: "13800000000", password: "secret" });

    await auth.getAccessToken();

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, payload, config] = mockPost.mock.calls[0];
    expect(url).toBe("https://login.123pan.com/api/user/sign_in");
    expect(payload).toEqual({ passport: "13800000000", password: "secret", remember: true });
    expect(config.headers).toMatchObject({ platform: "web", "app-version": "3" });
  });

  it("code=0 响应返回 token 并解析过期时间", async () => {
    const exp = futureExp(7200);
    mockPost.mockResolvedValue(sign_inResponse(makeJwt({ exp })));
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    await expect(auth.getAccessToken()).resolves.toBe(makeJwt({ exp }));
    expect(auth.getTokenInfo()?.expiresAt).toBe(exp * 1000);
  });

  it("code=200 响应使用 accessToken 字段", async () => {
    const jwt = makeJwt({ exp: futureExp() });
    mockPost.mockResolvedValue({
      data: { code: 200, message: "ok", data: { accessToken: jwt } },
    });
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    await expect(auth.getAccessToken()).resolves.toBe(jwt);
  });

  it("响应缺少 token 时抛出登录失败", async () => {
    mockPost.mockResolvedValue({ data: { code: 0, message: "ok", data: {} } });
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    await expect(auth.getAccessToken()).rejects.toThrow("响应中没有有效 token");
  });

  it("登录成功后复用 token，不再重复请求", async () => {
    mockPost.mockResolvedValue(sign_inResponse(makeJwt({ exp: futureExp() })));
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    await auth.getAccessToken();
    await auth.getAccessToken();

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("forceRefreshToken 重新登录并获取新 token", async () => {
    const jwt1 = makeJwt({ exp: futureExp(1000) });
    const jwt2 = makeJwt({ exp: futureExp(2000) });
    mockPost
      .mockResolvedValueOnce(sign_inResponse(jwt1))
      .mockResolvedValueOnce(sign_inResponse(jwt2));
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    await expect(auth.getAccessToken()).resolves.toBe(jwt1);
    await expect(auth.forceRefreshToken()).resolves.toBe(jwt2);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});

describe("并发刷新", () => {
  it("并发 getAccessToken 只触发一次登录", async () => {
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(sign_inResponse(makeJwt({ exp: futureExp() }))), 20),
        ),
    );
    const auth = new AuthManager({ ...baseConfig, passport: "a", password: "b" });

    const [token1, token2] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);

    expect(token1).toBe(token2);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe("二维码登录", () => {
  const generateUrl = "https://login.123pan.com/api/user/qr-code/generate";
  const resultUrl = "https://login.123pan.com/api/user/qr-code/result";

  it("generateQrLogin 返回 uniID 与拼接好的二维码链接", async () => {
    httpClientMock.get.mockResolvedValue({
      data: {
        code: 0,
        message: "ok",
        data: { uniID: "uni-1", url: "https://yun.123pan.cn/wx-app-login.html" },
      },
    });
    const auth = new AuthManager({ ...baseConfig });

    const session = await auth.generateQrLogin();

    expect(session).toEqual({
      uniID: "uni-1",
      qrUrl:
        "https://yun.123pan.cn/wx-app-login.html?env=production&uniID=uni-1&source=123pan&type=login",
    });
    expect(httpClientMock.get).toHaveBeenCalledWith(generateUrl);
  });

  it("生成响应缺少 uniID 或 url 时抛错", async () => {
    httpClientMock.get.mockResolvedValue({ data: { code: 0, message: "ok", data: {} } });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.generateQrLogin()).rejects.toThrow("生成二维码失败");
  });

  it.each([
    ["waiting", 0],
    ["scanned", 1],
    ["logging", 3],
  ] as const)("轮询 loginStatus=%i 映射为 %s", async (status, loginStatus) => {
    httpClientMock.get.mockResolvedValue({
      data: { code: 0, message: "ok", data: { loginStatus } },
    });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).resolves.toEqual({ status });
    expect(httpClientMock.get).toHaveBeenCalledWith(resultUrl, { params: { uniID: "uni-1" } });
  });

  it("已取消返回终态与默认消息", async () => {
    httpClientMock.get.mockResolvedValue({
      data: { code: 0, message: "", data: { loginStatus: 2 } },
    });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).resolves.toEqual({
      status: "cancelled",
      message: "二维码已被取消",
    });
  });

  it("已失效返回终态与服务端消息", async () => {
    httpClientMock.get.mockResolvedValue({
      data: { code: 0, message: "二维码已失效", data: { loginStatus: 4 } },
    });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).resolves.toEqual({
      status: "expired",
      message: "二维码已失效",
    });
  });

  it("code=200 且返回 token 时登录成功并写入实例", async () => {
    const exp = futureExp(3600);
    const jwt = makeJwt({ exp });
    httpClientMock.get.mockResolvedValue({
      data: { code: 200, message: "ok", data: { loginStatus: 3, token: jwt } },
    });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).resolves.toEqual({
      status: "success",
      token: jwt,
    });
    expect(auth.getTokenInfo()?.accessToken).toBe(jwt);
    expect(auth.getTokenInfo()?.expiresAt).toBe(exp * 1000);
  });

  it("未知状态或业务错误抛出异常", async () => {
    httpClientMock.get.mockResolvedValue({
      data: { code: 500, message: "boom", data: { loginStatus: 9 } },
    });
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).rejects.toThrow("boom");
  });

  it("网络错误直接透传", async () => {
    httpClientMock.get.mockRejectedValue(new Error("network down"));
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("uni-1")).rejects.toThrow("network down");
  });

  it("uniID 为空时直接抛错", async () => {
    const auth = new AuthManager({ ...baseConfig });

    await expect(auth.getQrLoginResult("")).rejects.toThrow("uniID");
    expect(httpClientMock.get).not.toHaveBeenCalled();
  });
});

describe("clearToken", () => {
  it("清空当前 token 信息", async () => {
    const auth = new AuthManager({ ...baseConfig, token: makeJwt({ exp: futureExp() }) });

    await auth.clearToken();

    expect(auth.getTokenInfo()).toBeNull();
  });
});
