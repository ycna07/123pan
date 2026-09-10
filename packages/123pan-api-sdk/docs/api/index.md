# API 参考

本章节提供 123Pan API SDK 的完整 API 文档。

::: tip 📚 官方文档参考
本 SDK 基于 [123Pan 开放平台官方文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced) 开发。

如需了解 API 的详细规范、限制和最新变更，请参考官方文档。
:::

## SDK 架构

SDK 采用模块化设计，每个功能模块独立管理：

```typescript
import Pan123SDK from '@123pan/api-sdk';

const sdk = new Pan123SDK({ ... });

sdk.file      // 云盘管理模块
sdk.image     // 图床模块
sdk.video     // 视频转码模块
sdk.offline   // 离线下载模块
sdk.user      // 用户模块
sdk.directLink // 直链模块
```

## 响应格式

所有 API 响应遵循统一格式：

```typescript
interface ApiResponse<T> {
  code: number;     // 响应码：0 表示成功
  message: string;  // 响应消息
  data: T;          // 响应数据
}
```

## 模块概览

SDK 提供以下功能模块：

### 核心模块

- [SDK 主类](/api/sdk) - SDK 初始化和通用方法

### 功能模块

- [云盘管理 (file)](/api/file) - 云盘文件上传、下载、管理和分享
- [用户 (user)](/api/user) - 用户信息获取
- [离线下载 (offline)](/api/offline) - 离线下载任务管理
- [直链 (directLink)](/api/direct-link) - 直链管理
- [图床 (image)](/api/image) - 图床图片上传和处理
- [视频转码 (video)](/api/video) - 视频转码服务

## 快速索引

### 云盘操作
```typescript
sdk.file.upload.uploadFile()       // 文件上传
sdk.file.getFileList()              // 获取文件列表
sdk.file.getFileInfos()             // 获取文件详情
sdk.file.moveFiles()                // 移动文件
sdk.file.renameFiles()              // 批量重命名
sdk.file.deleteFiles()              // 删除文件
sdk.file.getDownloadInfo()          // 获取下载信息
```

### 分享操作
```typescript
sdk.file.share.createShare()        // 创建普通分享
sdk.file.share.createContentPaymentShare() // 创建付费分享
```

### 图床操作
```typescript
sdk.image.upload.uploadFile()       // 图片上传
sdk.image.info.getImageDetail()     // 获取图片详情
sdk.image.info.getImageList()       // 获取图片列表
sdk.image.copy.copyFromCloudDisk()  // 复制图片
sdk.image.move.moveFiles()          // 移动图片
sdk.image.delete.deleteFiles()      // 删除图片
```

### 视频操作
```typescript
sdk.video.upload.fromCloudDisk()            // 从云盘上传到转码空间
sdk.video.getFileList()                     // 获取转码空间文件列表
sdk.video.info.getFolderInfo()              // 获取文件夹信息
sdk.video.info.getVideoResolutions()        // 获取可转码分辨率
sdk.video.info.getTranscodeList()           // 获取转码列表
sdk.video.transcodeVideo()                  // 启动转码任务
```

### 离线下载
```typescript
sdk.offline.createTask()            // 创建单个任务
sdk.offline.batchCreateTasks()      // 批量创建任务
sdk.offline.getDownloadProcess()    // 获取下载进度
sdk.offline.getTaskList()           // 获取任务列表
```

## 类型定义

SDK 导出所有类型定义，可以在你的代码中直接使用：

```typescript
import type {
  ApiResponse,
  SdkConfig,
  FileListItem,
  CreateShareParams,
  TranscodeVideoParams,
  // ... 更多类型
} from '@123pan/api-sdk';
```

## 错误处理

所有 API 调用都应该进行错误处理：

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
    console.error('错误:', result.message);
  }
} catch (error) {
  // 系统错误（网络错误、超时等）
  console.error('系统错误:', error);
}
```

## 常见错误码

| 错误码 | 说明 |
|-------|------|
| 0 | 成功 |
| 1 | 通用错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器错误 |

详细的错误码说明请参考 [官方文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced)。

## 下一步

选择你感兴趣的模块深入了解：

- [云盘管理模块](/api/file) - 最常用的功能
- [视频转码模块](/api/video) - 视频处理
- [图床模块](/api/image) - 图片处理
