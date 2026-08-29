# 123Pan API SDK 文档

::: tip 欢迎使用
这是 123Pan 开放平台的 Node.js SDK，提供完整的 API 封装和 TypeScript 类型支持。

**基于官方文档开发**：本 SDK 基于 [123Pan 开放平台官方文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced) 开发。
:::

## 特性

- 🚀 **完整的 API 覆盖** - 支持文件管理、分享、离线下载、直链、图片、视频转码等功能
- 📦 **模块化设计** - 按功能模块组织，可按需使用
- 🔒 **类型安全** - 完整的 TypeScript 类型定义
- ⚡ **自动认证** - 自动管理 token 刷新和重试
- 🎯 **简单易用** - 直观的 API 设计，清晰的文档

## 快速开始

### 安装

```bash
pnpm add @sharef/123pan-sdk
```

### 基础使用

```typescript
import Pan123SDK from '@sharef/123pan-sdk';

// 初始化 SDK
const sdk = new Pan123SDK({
});

// 使用 API
async function example() {
  // 获取用户信息
  const userInfo = await sdk.user.getUserInfo();
  console.log('用户信息:', userInfo);

  // 获取文件列表
  const fileList = await sdk.file.getFileList({
    parentFileId: 0,
    limit: 100,
  });
  console.log('文件列表:', fileList);
}

example();
```

## 主要模块

### 文件管理 (file)
- 文件上传（支持大文件分片上传）
- 文件下载
- 文件重命名、移动、删除
- 创建文件夹
- 分享管理

### 用户模块 (user)
- 获取用户信息

### 离线下载 (offline)
- 创建离线下载任务
- 批量创建任务
- 查询下载进度

### 直链管理 (directLink)
- 直链相关操作

### 图片管理 (image)
- 图片上传
- 图片处理
- 图片信息获取

### 视频转码 (video)
- 视频上传到转码空间
- 获取可转码分辨率
- 启动转码任务
- 查询转码列表

## 相关链接

- [📖 开始使用](/guide/quick-start) - 5分钟快速上手
- [📚 API 文档](/api/) - 完整的 API 参考
- [💡 示例代码](/examples/) - 实用的代码示例
- [🌐 官方文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced) - 123Pan 开放平台官方文档
- [🔑 开放平台](https://www.123pan.com/open) - 获取 Client ID 和 Secret

---

::: warning 版权声明
本项目中使用的 **123Pan Logo、品牌标识、相关图标及文字** 等知识产权归 **123云盘官方** 所有。

如有侵权，请联系删除。

**免责声明**: 本 SDK 为非官方实现，仅供学习和参考使用。使用本 SDK 产生的任何问题与 123Pan 官方无关。

[查看完整版权声明 →](/COPYRIGHT)
:::
