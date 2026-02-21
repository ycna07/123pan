/**
 * Redis客户端创建工具
 * 避免在编译时引入redis包
 */

export async function createRedisClient(config: any): Promise<any> {
  const { createClient } = await import("redis");

  if (config.url) {
    return createClient({ url: config.url });
  } else if (config.host && config.port) {
    return createClient({
      socket: {
        host: config.host,
        port: config.port,
      },
      password: config.password,
      database: config.db || 0,
    });
  }

  throw new Error("Invalid Redis configuration");
}
