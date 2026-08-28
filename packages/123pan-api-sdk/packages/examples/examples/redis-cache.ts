/**
 * Redis缓存使用示例
 */

import { Pan123SDK } from "@123pan/sdk";

// 方法1: 使用Redis URL配置
const sdk1 = new Pan123SDK({
  clientID: "your_client_id",
  clientSecret: "your_client_secret",
  cacheConfig: {
    enabled: true,
    redis: {
      enabled: true,
      url: "redis://localhost:6379",
      keyPrefix: "123pan:token:",
    },
  },
});

// 方法2: 使用Redis host和port配置
const sdk2 = new Pan123SDK({
  clientID: "your_client_id",
  clientSecret: "your_client_secret",
  cacheConfig: {
    enabled: true,
    redis: {
      enabled: true,
      host: "localhost",
      port: 6379,
      password: "your_password", // 可选
      db: 0, // 可选，默认0
      keyPrefix: "123pan:token:",
    },
  },
});

// 方法3: 使用现有的Redis客户端实例
const { createClient } = await import("redis");

const redisClient = createClient({
  url: "redis://localhost:6379",
});

(async () => {
  await redisClient.connect();

  const sdk3 = new Pan123SDK({
    clientID: "your_client_id",
    clientSecret: "your_client_secret",
    cacheConfig: {
      enabled: true,
      redis: {
        enabled: true,
        client: redisClient, // 使用现有的Redis客户端
        keyPrefix: "123pan:token:",
      },
    },
  });

  // 使用SDK
  const authManager = sdk3.getHttpClient().getAuthManager();
  const token = await authManager.getAccessToken();
  console.log("Token:", token);
})();

// 缓存优先级说明：
// 1. Redis缓存（如果配置且可用）
// 2. 文件缓存（如果启用）
// 3. 内存缓存

// 这样在动态导入场景下，多个SDK实例可以共享同一个Redis中的token，
// 避免重复请求API导致被限流。

// 在动态导入场景中使用：
let cachedSdk: Pan123SDK | null = null;

async function getSDKInstance() {
  const { Pan123SDK: SDKClass } = await import("@123pan/sdk");

  // 每次创建新实例，但由于Redis缓存的存在，不会重复请求token
  return new SDKClass({
    clientID: "your_client_id",
    clientSecret: "your_client_secret",
    cacheConfig: {
      enabled: true,
      redis: {
        enabled: true,
        url: "redis://localhost:6379",
      },
    },
  });
}

// 使用示例
(async () => {
  const sdkInstance1 = await getSDKInstance();
  const authManager1 = sdkInstance1.getHttpClient().getAuthManager();
  const token1 = await authManager1.getAccessToken();

  const sdkInstance2 = await getSDKInstance();
  const authManager2 = sdkInstance2.getHttpClient().getAuthManager();
  const token2 = await authManager2.getAccessToken();

  // token1 和 token2 应该是相同的，都是从Redis缓存中读取的
  console.log("Token 1:", token1);
  console.log("Token 2:", token2);
  console.log("Same token?", token1 === token2);
})();
