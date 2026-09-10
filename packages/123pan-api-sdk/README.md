# 123Pan API SDK
> 123Pan 普通用户 API 的 Node.js SDK，提供完整的 TypeScript 类型支持

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## 📚 文档

- **完整文档**: [docs/](./docs/)
- **API 基础地址**: `https://www.123pan.com/b`

## ✨ 特性

- 🚀 **核心 API 覆盖** - 支持云盘文件、分享、上传和离线下载
- 📦 **模块化设计** - 支持全量引入和按需引入，可减少 60-80% 打包体积
- 🔒 **类型安全** - 完整的 TypeScript 类型定义
- ⚡ **自动认证** - 自动管理 token 刷新和重试
- 🎯 **简单易用** - 直观的 API 设计，清晰的文档
- 🔄 **自动重试** - 请求失败时自动重试
- 🛡️ **限流保护** - 内置令牌桶算法防止 API 限流

## 安装

```bash
pnpm add @123pan/api-sdk
```

## 快速开始

```typescript
import Pan123SDK from '@123pan/api-sdk';

// 初始化 SDK
const sdk = new Pan123SDK({
  // 二选一：直接使用网页端 JWT token
  token: 'your-web-token',
  // 或使用账号密码自动登录
  // passport: 'your-account',
  // password: 'your-password',
});

// 获取用户信息
const userInfo = await sdk.user.getUserInfo();
console.log('用户名:', userInfo.data.nickname);

// 上传文件到云盘
const result = await sdk.file.upload.uploadFile({
  filename: 'document.pdf',
  file: Buffer.from('file-content'),
  parentFileID: 0,
  onProgress: (progress) => {
    console.log(`上传进度: ${progress.percent}%`);
  }
});

// 创建分享
await sdk.file.share.createShare({
  shareName: '我的文档',
  shareExpire: 7,
  fileIDList: [result.data.fileId],
});
console.log('分享码:', share.data.shareKey);
```

## 主要功能

### 📁 云盘管理

```typescript
// 文件上传（支持大文件自动分片）
await sdk.file.upload.uploadFile({ ... });

// 获取文件列表
await sdk.file.getFileList({ parentFileId: 0, limit: 100 });

// 批量重命名
await sdk.file.renameFiles({ ... });

// 移动文件
await sdk.file.moveFiles({ ... });

// 删除文件
await sdk.file.deleteFiles({ ... });

// 获取下载链接
await sdk.file.getDownloadInfo({ fileId: 123 });
```

### 🔗 分享管理

```typescript
// 创建普通分享
await sdk.file.share.createShare({
  shareName: '我的分享',
  shareExpire: 7,
  fileIDList: [123456],
  sharePwd: 'abc123', // 可选
});

// 创建付费分享
await sdk.file.share.createContentPaymentShare({
  shareName: '付费资源',
  fileIDList: [123456],
  price: 9.9,
});
```

### 🖼️ 图床功能

```typescript
// 图床能力属于 Open API。SDK 保留模块和类型，但在普通用户 API 模式下没有对应端点。
```

### 🎬 视频转码

```typescript
// 视频转码能力属于 Open API。SDK 保留模块和类型，但在普通用户 API 模式下没有对应端点。
```

### 📥 离线下载

```typescript
// 创建单个离线任务
await sdk.offline.createTask({
  url: 'https://example.com/file.zip',
  parentId: 0,
});

// 批量创建任务
await sdk.offline.batchCreateTasks({
  urls: [
    'https://example.com/video1.mp4',
    'https://example.com/video2.mp4',
  ],
});

// 查询下载进度
await sdk.offline.getDownloadProcess({ taskID: 123 });
```

## 按需引入

支持按需引入，减小打包体积：

```typescript
// 只引入需要的模块
import { HttpClient } from '@123pan/api-sdk/core';
import { FileModule } from '@123pan/api-sdk/file';
import { ImageModule } from '@123pan/api-sdk/image';

const httpClient = new HttpClient({
  token: 'your-web-token',
});

const file = new FileModule(httpClient);
const image = new ImageModule(httpClient);

// 打包体积减少 60-80%
```

## 配置选项

```typescript
const sdk = new Pan123SDK({
  // 认证二选一：网页端 JWT token，或 passport + password
  token: 'your-web-token',
  // passport: 'your-account',
  // password: 'your-password',

  // 可选参数
  baseURL: 'https://www.123pan.com/b',     // API 基础 URL
  loginBaseURL: 'https://login.123pan.com/api', // 登录 API 基础 URL
  loginuuid: 'stable-or-random-uuid',      // 可选请求标识
  debug: false,                             // 调试模式
  debugToken: 'your-jwt-token',             // 调试令牌
});
```

## 错误处理

```typescript
try {
  const result = await sdk.file.getFileList({
    parentFileId: 0,
    limit: 100,
  });
  
  if (result.code === 0) {
    // 成功
    console.log('文件列表:', result.data.fileList);
  } else {
    // 业务错误
    console.error('错误:', result.code, result.message);
  }
} catch (error) {
  // 系统错误（网络错误、超时等）
  console.error('系统错误:', error);
}
```

## 文档

- 📚 [API 参考](./docs/api)
- 💡 [示例代码](./packages/examples)
- 🌐 [官方 API 文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced)

## 示例项目

查看 [packages/examples](./packages/examples) 目录获取更多示例代码。

## 环境要求

- Node.js >= 16.0.0
- TypeScript >= 4.5.0（如果使用 TypeScript）

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目以 [GNU General Public License v3.0](./LICENSE) 发布。

来源说明与作者信息处理方式见 [NOTICE.md](./NOTICE.md)。

## 相关链接

- [123Pan 开放平台](https://www.123pan.com/open)
- [官方 API 文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced)
- [官方网站](https://www.123pan.com)

## 版权声明

本项目中使用的 123Pan Logo、品牌标识、相关图标及文字等知识产权归 **123云盘官方** 所有。

如有侵权，请联系删除。

**免责声明**: 本 SDK 为非官方实现，仅供学习和参考使用。使用本 SDK 产生的任何问题与 123Pan 官方无关。
