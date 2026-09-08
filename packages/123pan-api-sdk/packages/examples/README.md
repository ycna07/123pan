# @123pan/examples

`@123pan/sdk` 的可运行示例集，全部通过环境变量读取测试凭证，不会硬编码任何账号信息。

## 准备凭证

任选其一设置环境变量：

| 变量 | 说明 |
| --- | --- |
| `P123_TEST_TOKEN` | 网页端 JWT：登录示例直接使用（优先级最高），`debug-token` 示例用它做解码展示 |
| `P123_TEST_PASSPORT` + `P123_TEST_PASSWORD` | 账号（手机号或邮箱）与密码，token 未设置时使用 |

所有变量均可写入本目录 `.env`（环境变量优先），参见 `.env.example`。

## 运行示例

```bash
# 在 SDK 根目录（packages/123pan-api-sdk）执行，或进入本目录
pnpm login         # 账号密码登录，查看 token 过期时间并清理凭证
pnpm qr            # 扫码登录全流程（生成二维码 → 轮询 → 查询用户）
pnpm user          # 查询用户信息与存储空间
pnpm files         # 遍历根目录文件列表（lastFileId 翻页）
pnpm debug-token   # 解析 .env 中的 debugToken（签名算法/用户信息/签名）
```

例如：

```bash
P123_TEST_PASSPORT=13800000000 P123_TEST_PASSWORD=xxx pnpm user
```

`debug-token` 示例与登录示例共用 `P123_TEST_TOKEN`：

```bash
cp .env.example .env   # 然后编辑 .env 填入 P123_TEST_TOKEN
pnpm debug-token
```

`.env` 已被 `.gitignore` 忽略，不会提交。

## 示例说明

- `src/client.ts` — 共享客户端工厂，按环境变量创建 `Pan123SDK`；`tokenTtlSeconds` 解析 JWT 剩余有效期
- `src/login.ts` — 账号密码登录（`/user/sign_in`），读取 `getTokenInfo` 后调用 `clearAuth`
- `src/qr-login.ts` — 扫码登录：`createQrLogin` 生成二维码内容，2 秒轮询 `pollQrLogin` 直到成功/取消/过期
- `src/user.ts` — `user.getUserInfo` 展示账号、VIP 与空间用量
- `src/files.ts` — `file.getFileList` 分页遍历根目录（`lastFileId === -1` 表示最后一页）
- `src/debug-token.ts` — 从 `.env` 读取 debugToken 并解码 JWT：Header 签名算法、Payload 用户信息（时间戳转本地时间、剩余有效期）、Signature；仅解码不验签

## 未包含的模块

`image`（图床）、`video`（转码）与 `direct-link` 的部分能力属于 Open API / VIP 专属接口，
普通用户 API 模式下没有对应端点，因此不在示例范围内；相关模块仍在 SDK 中保留。
