# Redis缓存支持

## 概述

在某些应用场景下（如使用动态导入），SDK实例的内存缓存会失效，导致每次都需要重新请求accessToken，频繁请求可能触发图床服务器的限流机制。

为了解决这个问题，SDK现在支持多级缓存机制，优先级如下：

1. **Redis缓存**（如果配置且可用）
2. **文件缓存**（如果启用）
3. **内存缓存**

## 配置Redis缓存

### 1. 使用Redis URL配置

```typescript
import { Pan123SDK } from "@123pan/sdk";

const sdk = new Pan123SDK({
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
```

### 2. 使用Redis host和port配置

```typescript
import { Pan123SDK } from "@123pan/sdk";

const sdk = new Pan123SDK({
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
```

### 3. 使用现有的Redis客户端实例

```typescript
import { Pan123SDK } from "@123pan/sdk";
import { createClient } from "redis";

const redisClient = createClient({
  url: "redis://localhost:6379",
});

await redisClient.connect();

const sdk = new Pan123SDK({
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
```

## 动态导入场景使用

在动态导入场景下，使用Redis缓存可以避免重复请求token：

```typescript
let cachedSdk: Pan123SDK | null = null;

async function getSDKInstance() {
  const { Pan123SDK } = await import("@123pan/sdk");

  return new Pan123SDK({
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
  const token1 = await sdkInstance1
    .getHttpClient()
    .getAuthManager()
    .getAccessToken();

  const sdkInstance2 = await getSDKInstance();
  const token2 = await sdkInstance2
    .getHttpClient()
    .getAuthManager()
    .getAccessToken();

  // token1 和 token2 应该是相同的，都是从Redis缓存中读取的
  console.log("Same token?", token1 === token2); // true
})();
```

## 配置参数说明

### cacheConfig.redis.enabled

- 类型: `boolean`
- 默认值: `false`
- 说明: 是否启用Redis缓存

### cacheConfig.redis.url

- 类型: `string`
- 说明: Redis连接URL，格式：`redis://[password@]host:port[/db]`

### cacheConfig.redis.host

- 类型: `string`
- 说明: Redis服务器地址

### cacheConfig.redis.port

- 类型: `number`
- 说明: Redis服务器端口

### cacheConfig.redis.password

- 类型: `string`
- 说明: Redis密码（可选）

### cacheConfig.redis.db

- 类型: `number`
- 说明: Redis数据库索引，默认为0（可选）

### cacheConfig.redis.keyPrefix

- 类型: `string`
- 默认值: `"123pan:token:"`
- 说明: Redis键前缀，用于避免键冲突

### cacheConfig.redis.client

- 类型: `any`
- 说明: 现有的Redis客户端实例（如果提供，则忽略其他配置）

## 安装Redis客户端

Redis包是可选依赖，如果使用Redis缓存功能，需要安装：

```bash
npm install redis
# 或
yarn add redis
# 或
pnpm add redis
```

## 注意事项

1. **Redis是可选依赖**：SDK不强制要求安装redis包，只有在配置中使用Redis时才需要
2. **缓存同步**：SDK会自动同步不同级别的缓存，当从文件缓存获取token时，会自动同步到Redis
3. **Token过期处理**：缓存会自动检测token是否过期，过期后会清除缓存并重新获取
4. **性能考虑**：Redis缓存可以显著提高性能，特别是在多实例场景下

## 故障处理

如果Redis连接失败，SDK会自动降级到文件缓存或内存缓存，不会影响正常使用。相关错误信息会记录在日志中。

```typescript
// SDK会自动处理Redis连接失败的情况
const sdk = new Pan123SDK({
  clientID: "your_client_id",
  clientSecret: "your_client_secret",
  cacheConfig: {
    enabled: true,
    redis: {
      enabled: true,
      url: "redis://unreachable-host:6379", // 如果连接失败
    },
  },
});

// 如果Redis不可用，会自动降级到文件缓存或内存缓存
// 不会影响SDK的正常功能
```
