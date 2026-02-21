/**
 * Redis模块类型声明（可选依赖）
 */

declare module "redis" {
  export function createClient(config: any): any;
}
