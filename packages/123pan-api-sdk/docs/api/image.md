# 图床模块

图床模块（`image`）提供专业的图片存储和管理服务，适合需要图片外链的场景。

## 模块说明

::: tip 💡 图床功能特点
- **专业图片存储**：专门为图片优化的存储服务
- **自动获取外链**：上传后自动生成可访问的图片链接
- **图片处理**：支持缩放、裁剪等参数化访问
- **独立空间**：与云盘空间独立，互不影响

**适用场景**：博客图片、网站素材、CDN 加速、图片外链等
:::

## 子模块

图片模块包含以下子模块：

- `sdk.image.upload` - 图片上传
- `sdk.image.copy` - 复制图片
- `sdk.image.move` - 移动图片
- `sdk.image.delete` - 删除图片
- `sdk.image.info` - 图片信息查询
- `sdk.image.view` - 图片查看/获取

## 上传模块 (upload)

### uploadFile()

一键上传图片文件（自动处理创建、上传、完成等步骤）。

**参数**

```typescript
interface UploadFileParams {
  filePath: string;           // 本地文件路径
  fileName: string;           // 文件名
  parentId?: number;          // 父目录ID（选填，默认为根目录）
  async?: boolean;            // 是否异步上传（选填，默认false）
  onProgress?: (progress: number) => void;  // 进度回调
}
```

**示例**

```typescript
// 同步上传（等待上传完成并返回图片链接）
const result = await sdk.image.upload.uploadFile({
  filePath: './photo.jpg',
  fileName: 'photo.jpg',
  parentId: 0,
  onProgress: (progress) => {
    console.log(`上传进度: ${progress}%`);
  },
});

if (result.code === 0) {
  console.log('图片ID:', result.data.fileId);
  console.log('图片链接:', result.data.downloadUrl);
}

// 异步上传（立即返回，需要轮询查询结果）
const asyncResult = await sdk.image.upload.uploadFile({
  filePath: './photo.jpg',
  fileName: 'photo.jpg',
  async: true,  // 启用异步模式
});

if (asyncResult.code === 0) {
  // 异步模式返回 asyncUploadId，需要轮询查询
  console.log('异步上传ID:', asyncResult.data.asyncUploadId);
}
```

### 其他上传方法

- `createFolder()` - 创建文件夹
- `createFile()` - 创建文件（获取上传凭证）
- `uploadSlice()` - 上传文件分片
- `uploadComplete()` - 通知上传完成
- `getUploadResult()` - 查询上传结果

详细说明请参考[文件上传文档](/examples/image)。

---

## 复制模块 (copy)

### copyFromCloudDisk()

从云盘空间复制图片到图床空间。

**参数**

```typescript
interface CopyParams {
  fileIds: (number | string)[];  // 要复制的文件ID列表
  targetFolderId?: number;       // 目标文件夹ID（选填）
}
```

**示例**

```typescript
const result = await sdk.image.copy.copyFromCloudDisk({
  fileIds: [12345, 67890],
  targetFolderId: 0,  // 复制到图床根目录
});

if (result.code === 0) {
  console.log('复制任务ID:', result.data.taskId);
  
  // 查询复制进度
  const progress = await sdk.image.copy.getCopyTaskProcess({
    taskId: result.data.taskId,
  });
  
  console.log('复制进度:', progress.data);
}
```

### getCopyTaskProcess()

获取复制任务进度。

**参数**

```typescript
{
  taskId: number | string;  // 复制任务ID
}
```

### getCopyFailFiles()

获取复制失败的文件列表。

**参数**

```typescript
{
  taskId: number | string;  // 复制任务ID
}
```

---

## 移动模块 (move)

### moveFiles()

移动图片到指定目录。

**参数**

```typescript
interface MoveFilesParams {
  fileIds: (number | string)[];  // 要移动的文件ID列表
  targetFolderId: number;        // 目标文件夹ID
}
```

**示例**

```typescript
const result = await sdk.image.move.moveFiles({
  fileIds: [12345, 67890],
  targetFolderId: 999,  // 移动到文件夹999
});

if (result.code === 0) {
  console.log('移动成功');
}
```

---

## 删除模块 (delete)

### deleteFiles()

删除图片文件。

**参数**

```typescript
interface DeleteFilesParams {
  fileIds: (number | string)[];  // 要删除的文件ID列表
}
```

**示例**

```typescript
const result = await sdk.image.delete.deleteFiles({
  fileIds: [12345, 67890],
});

if (result.code === 0) {
  console.log('删除成功');
}
```

---

## 信息查询模块 (info)

### getImageDetail()

获取单个图片的详细信息。

**参数**

```typescript
{
  fileId: number | string;  // 图片文件ID
}
```

**示例**

```typescript
const result = await sdk.image.info.getImageDetail({
  fileId: 12345,
});

if (result.code === 0) {
  const image = result.data;
  console.log('文件名:', image.filename);
  console.log('大小:', image.size, '字节');
  console.log('尺寸:', `${image.width}x${image.height}`);
  console.log('格式:', image.format);
}
```

### getImageList()

获取图片列表。

**参数**

```typescript
interface GetImageListParams {
  parentFileId: number;      // 父文件夹ID
  limit: number;             // 每页数量（最大100）
  searchData?: string;       // 搜索关键字（选填）
  lastFileId?: number;       // 翻页ID（选填）
}
```

**示例**

```typescript
const result = await sdk.image.info.getImageList({
  parentFileId: 0,   // 根目录
  limit: 50,
  searchData: 'photo',  // 搜索包含"photo"的文件
});

if (result.code === 0) {
  console.log(`找到 ${result.data.fileList.length} 张图片`);
  
  result.data.fileList.forEach(image => {
    console.log(`- ${image.filename} (${image.width}x${image.height})`);
  });
}
```

---

## 查看模块 (view)

### getImageUrl()

获取图片访问链接（支持图片处理参数）。

**参数**

```typescript
interface GetImageUrlParams {
  fileId: number | string;   // 图片文件ID
  width?: number;            // 宽度（选填）
  height?: number;           // 高度（选填）
}
```

**示例**

```typescript
// 获取原图链接
const result = await sdk.image.view.getImageUrl({
  fileId: 12345,
});

if (result.code === 0) {
  console.log('原图链接:', result.data.url);
}

// 获取缩放后的图片
const thumbResult = await sdk.image.view.getImageUrl({
  fileId: 12345,
  width: 800,
  height: 600,
});

if (thumbResult.code === 0) {
  console.log('缩略图链接:', thumbResult.data.url);
}
```

### getImageStream()

获取图片流（用于下载或处理）。

**参数**

```typescript
{
  fileId: number | string;  // 图片文件ID
}
```

**示例**

```typescript
const result = await sdk.image.view.getImageStream({
  fileId: 12345,
});

if (result.code === 0) {
  // result.data 是 ReadableStream
  // 可以保存到文件或进行其他处理
}
```

### getImageBlob()

获取图片 Blob 对象（浏览器环境）。

**参数**

```typescript
{
  fileId: number | string;  // 图片文件ID
}
```

## 完整示例

```typescript
import Pan123SDK from '@123pan/api-sdk';
import * as fs from 'fs';

async function imageWorkflow() {
  const sdk = new Pan123SDK({
  });

  // 1. 上传图片
  console.log('上传图片...');
  const uploadResult = await sdk.image.upload.uploadFile({
    filePath: './my-photo.jpg',
    fileName: 'my-photo.jpg',
    parentId: 0,
    onProgress: (progress) => {
      console.log(`  上传进度: ${progress}%`);
    },
  });

  if (uploadResult.code !== 0) {
    console.error('上传失败:', uploadResult.message);
    return;
  }

  const fileId = uploadResult.data.fileId;
  console.log('✅ 上传成功! 文件ID:', fileId);

  // 2. 获取图片信息
  const infoResult = await sdk.image.info.getImageDetail({ fileId });
  if (infoResult.code === 0) {
    const img = infoResult.data;
    console.log('\n图片信息:');
    console.log('- 文件名:', img.filename);
    console.log('- 尺寸:', `${img.width}x${img.height}`);
    console.log('- 大小:', (img.size / 1024).toFixed(2), 'KB');
  }

  // 3. 获取不同尺寸的图片链接
  const urlResult = await sdk.image.view.getImageUrl({
    fileId,
    width: 800,
    height: 600,
  });

  if (urlResult.code === 0) {
    console.log('\n缩略图链接:', urlResult.data.url);
  }

  // 4. 获取图片列表
  const listResult = await sdk.image.info.getImageList({
    parentFileId: 0,
    limit: 10,
  });

  if (listResult.code === 0) {
    console.log(`\n图床中共有 ${listResult.data.fileList.length} 张图片`);
  }
}

imageWorkflow();
```

## 注意事项

1. **文件格式**: 支持常见图片格式（JPG, PNG, GIF, WEBP 等）
2. **文件大小**: 单张图片最大支持 20MB
3. **图片处理**: URL 中的 width/height 参数由服务器处理，自动缩放
4. **异步上传**: 大文件建议使用异步模式，避免请求超时
5. **批量操作**: 复制、移动、删除操作支持批量，但有数量限制

