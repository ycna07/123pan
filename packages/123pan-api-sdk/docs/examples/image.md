# 图床使用示例

本章节展示图床模块的实际使用案例。

::: tip 💡 图床功能说明
图床（`image` 模块）是专门为图片存储和外链优化的服务：

**与云盘的区别**：
- **云盘**（`file`）：通用文件存储，支持各种文件类型
- **图床**（`image`）：专门的图片存储，自动生成图片外链

**适用场景**：
- ✅ 博客、网站的图片素材
- ✅ 需要图片外链的场景
- ✅ 图片 CDN 加速
- ✅ 图片分享和展示
:::

## 图片上传

### 上传单张图片

```typescript
import Pan123SDK from '@123pan/api-sdk';

const sdk = new Pan123SDK({
});

async function uploadImage() {
  const result = await sdk.image.upload.uploadFile({
    filePath: './photo.jpg',
    fileName: 'photo.jpg',
    parentId: 0,  // 上传到图床根目录
    onProgress: (progress) => {
      console.log(`上传进度: ${progress}%`);
    },
  });

  if (result.code === 0) {
    console.log('✅ 上传成功!');
    console.log('图片ID:', result.data.fileId);
    console.log('图片链接:', result.data.downloadUrl);
    return result.data;
  } else {
    console.error('上传失败:', result.message);
  }
}
```

### 批量上传图片

```typescript
import * as fs from 'fs';
import * as path from 'path';

async function batchUploadImages(directory: string) {
  const files = fs.readdirSync(directory);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return imageExtensions.includes(ext);
  });

  console.log(`找到 ${imageFiles.length} 张图片`);

  const results = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const filePath = path.join(directory, filename);
    
    console.log(`\n[${i + 1}/${imageFiles.length}] 上传: ${filename}`);

    const result = await sdk.image.upload.uploadFile({
      filePath,
      fileName: filename,
      parentId: 0,
      onProgress: (progress) => {
        process.stdout.write(`\r  进度: ${progress.toFixed(2)}%`);
      },
    });

    if (result.code === 0) {
      console.log('\n  ✅ 成功');
      results.push({
        filename,
        fileId: result.data.fileId,
        url: result.data.downloadUrl,
      });
    } else {
      console.log(`\n  ❌ 失败: ${result.message}`);
    }
  }

  console.log(`\n完成! 成功上传 ${results.length}/${imageFiles.length} 张图片`);
  return results;
}

// 使用
const uploadedImages = await batchUploadImages('./images');
console.log(JSON.stringify(uploadedImages, null, 2));
```

### 上传图片并生成缩略图

```typescript
async function uploadWithThumbnail() {
  // 1. 上传原图
  const uploadResult = await sdk.image.upload.uploadFile({
    filePath: './high-res-photo.jpg',
    fileName: 'high-res-photo.jpg',
    parentId: 0,
  });

  if (uploadResult.code !== 0) {
    console.error('上传失败');
    return;
  }

  const fileId = uploadResult.data.fileId;
  console.log('✅ 原图上传成功');

  // 2. 获取不同尺寸的图片链接
  const sizes = [
    { name: '原图', width: undefined, height: undefined },
    { name: '大图', width: 1920, height: 1080 },
    { name: '中图', width: 800, height: 600 },
    { name: '小图', width: 400, height: 300 },
    { name: '缩略图', width: 200, height: 150 },
  ];

  console.log('\n图片链接:');
  for (const size of sizes) {
    const result = await sdk.image.view.getImageUrl({
      fileId,
      width: size.width,
      height: size.height,
    });

    if (result.code === 0) {
      console.log(`${size.name}: ${result.data.url}`);
    }
  }
}
```

## 图片管理

### 获取图片列表

```typescript
async function listImages() {
  const result = await sdk.image.info.getImageList({
    parentFileId: 0,
    limit: 50,
  });

  if (result.code === 0) {
    console.log(`找到 ${result.data.fileList.length} 张图片`);
    
    result.data.fileList.forEach((img, index) => {
      console.log(`\n${index + 1}. ${img.filename}`);
      console.log(`   ID: ${img.fileId}`);
      console.log(`   尺寸: ${img.width}x${img.height}`);
      console.log(`   大小: ${(img.size / 1024).toFixed(2)} KB`);
      console.log(`   格式: ${img.format}`);
    });

    // 如果还有更多图片
    if (result.data.lastFileId !== -1) {
      console.log(`\n还有更多图片，lastFileId: ${result.data.lastFileId}`);
    }
  }
}
```

### 搜索图片

```typescript
async function searchImages(keyword: string) {
  const result = await sdk.image.info.getImageList({
    parentFileId: 0,
    limit: 100,
    searchData: keyword,
  });

  if (result.code === 0) {
    console.log(`找到 ${result.data.fileList.length} 张包含 "${keyword}" 的图片`);
    
    result.data.fileList.forEach(img => {
      console.log(`- ${img.filename} (${img.width}x${img.height})`);
    });
  }
}

// 搜索所有包含 "logo" 的图片
await searchImages('logo');
```

### 获取图片详细信息

```typescript
async function getImageDetails(fileId: number) {
  const result = await sdk.image.info.getImageDetail({
    fileId,
  });

  if (result.code === 0) {
    const img = result.data;
    
    console.log('图片详情:');
    console.log('- 文件名:', img.filename);
    console.log('- 文件ID:', img.fileId);
    console.log('- 尺寸:', `${img.width}x${img.height} 像素`);
    console.log('- 大小:', `${(img.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('- 格式:', img.format);
    console.log('- MD5:', img.etag);
    console.log('- 上传时间:', img.createAt);
    console.log('- 修改时间:', img.updateAt);
  }
}
```

## 图片复制

### 从云盘复制到图床

```typescript
async function copyFromCloudDisk() {
  // 复制单个文件
  const result = await sdk.image.copy.copyFromCloudDisk({
    fileIds: [12345],  // 云盘文件ID
    targetFolderId: 0,
  });

  if (result.code === 0) {
    const taskId = result.data.taskId;
    console.log('复制任务已创建，ID:', taskId);

    // 轮询查询进度
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const progress = await sdk.image.copy.getCopyTaskProcess({
        taskId,
      });

      if (progress.code === 0) {
        const { status, successCount, totalCount } = progress.data;
        
        console.log(`进度: ${successCount}/${totalCount}`);
        
        if (status === 'completed') {
          console.log('✅ 复制完成!');
          break;
        } else if (status === 'failed') {
          console.error('❌ 复制失败');
          
          // 获取失败文件列表
          const failedFiles = await sdk.image.copy.getCopyFailFiles({
            taskId,
          });
          
          if (failedFiles.code === 0) {
            console.log('失败文件:');
            failedFiles.data.failedFiles.forEach(f => {
              console.log(`- ${f.filename}: ${f.reason}`);
            });
          }
          break;
        }
      }
    }
  }
}
```

### 批量复制

```typescript
async function batchCopyImages(fileIds: number[]) {
  const result = await sdk.image.copy.copyFromCloudDisk({
    fileIds,
    targetFolderId: 0,
  });

  if (result.code === 0) {
    console.log(`✅ 批量复制任务已创建`);
    console.log(`任务ID: ${result.data.taskId}`);
    console.log(`文件数量: ${fileIds.length}`);
    
    // 可以后续查询进度
    return result.data.taskId;
  }
}
```

## 图片移动

### 移动到指定文件夹

```typescript
async function organizeImages() {
  // 1. 获取所有图片
  const listResult = await sdk.image.info.getImageList({
    parentFileId: 0,
    limit: 100,
  });

  if (listResult.code !== 0) return;

  // 2. 按文件类型分类
  const jpgImages = listResult.data.fileList.filter(f => 
    f.filename.toLowerCase().endsWith('.jpg')
  );
  
  const pngImages = listResult.data.fileList.filter(f => 
    f.filename.toLowerCase().endsWith('.png')
  );

  // 3. 移动到不同文件夹
  if (jpgImages.length > 0) {
    const jpgFolderId = 1001;  // JPG 文件夹ID
    
    await sdk.image.move.moveFiles({
      fileIds: jpgImages.map(f => f.fileId),
      targetFolderId: jpgFolderId,
    });
    
    console.log(`✅ 移动了 ${jpgImages.length} 张 JPG 图片`);
  }

  if (pngImages.length > 0) {
    const pngFolderId = 1002;  // PNG 文件夹ID
    
    await sdk.image.move.moveFiles({
      fileIds: pngImages.map(f => f.fileId),
      targetFolderId: pngFolderId,
    });
    
    console.log(`✅ 移动了 ${pngImages.length} 张 PNG 图片`);
  }
}
```

## 图片删除

### 删除单张图片

```typescript
async function deleteImage(fileId: number) {
  const result = await sdk.image.delete.deleteFiles({
    fileIds: [fileId],
  });

  if (result.code === 0) {
    console.log('✅ 图片已删除');
  } else {
    console.error('删除失败:', result.message);
  }
}
```

### 批量删除旧图片

```typescript
async function deleteOldImages(daysOld: number) {
  const listResult = await sdk.image.info.getImageList({
    parentFileId: 0,
    limit: 100,
  });

  if (listResult.code !== 0) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const oldImages = listResult.data.fileList.filter(img => {
    const createDate = new Date(img.createAt);
    return createDate < cutoffDate;
  });

  if (oldImages.length === 0) {
    console.log('没有需要删除的旧图片');
    return;
  }

  console.log(`找到 ${oldImages.length} 张超过 ${daysOld} 天的图片`);
  
  const result = await sdk.image.delete.deleteFiles({
    fileIds: oldImages.map(img => img.fileId),
  });

  if (result.code === 0) {
    console.log('✅ 批量删除成功');
  }
}

// 删除30天前的图片
await deleteOldImages(30);
```

## 图片处理与获取

### 获取不同尺寸的图片

```typescript
async function getResizedImages(fileId: number) {
  const sizes = [
    { name: '原图', width: undefined, height: undefined },
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '800x600', width: 800, height: 600 },
    { name: '400x300', width: 400, height: 300 },
  ];

  console.log('图片链接:');
  
  for (const size of sizes) {
    const result = await sdk.image.view.getImageUrl({
      fileId,
      width: size.width,
      height: size.height,
    });

    if (result.code === 0) {
      console.log(`${size.name}: ${result.data.url}`);
    }
  }
}
```

### 生成 Markdown 图片链接

```typescript
async function generateMarkdownLinks(fileIds: number[]) {
  const links: string[] = [];

  for (const fileId of fileIds) {
    const infoResult = await sdk.image.info.getImageDetail({ fileId });
    
    if (infoResult.code !== 0) continue;

    const urlResult = await sdk.image.view.getImageUrl({ fileId });
    
    if (urlResult.code !== 0) continue;

    const filename = infoResult.data.filename;
    const url = urlResult.data.url;
    
    links.push(`![${filename}](${url})`);
  }

  console.log('Markdown 链接:\n');
  console.log(links.join('\n'));
  
  return links;
}

// 使用
const imageIds = [12345, 67890, 111];
await generateMarkdownLinks(imageIds);
```

## 完整示例：图床工具

```typescript
import Pan123SDK from '@123pan/api-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

class ImageHostingTool {
  private sdk: Pan123SDK;
  private uploadedImages: Array<{
    filename: string;
    fileId: number;
    url: string;
  }> = [];

  constructor(sdk: Pan123SDK) {
    this.sdk = sdk;
  }

  // 上传目录中的所有图片
  async uploadDirectory(directory: string) {
    const files = fs.readdirSync(directory);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    console.log(`找到 ${imageFiles.length} 张图片\n`);

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      const filePath = path.join(directory, filename);
      
      console.log(`[${i + 1}/${imageFiles.length}] 上传: ${filename}`);

      const result = await this.sdk.image.upload.uploadFile({
        filePath,
        fileName: filename,
        parentId: 0,
        onProgress: (progress) => {
          process.stdout.write(`\r  进度: ${progress.toFixed(2)}%`);
        },
      });

      if (result.code === 0) {
        console.log('\n  ✅ 成功');
        this.uploadedImages.push({
          filename,
          fileId: result.data.fileId,
          url: result.data.downloadUrl,
        });
      } else {
        console.log(`\n  ❌ 失败: ${result.message}`);
      }
    }

    console.log(`\n完成! 成功: ${this.uploadedImages.length}/${imageFiles.length}`);
  }

  // 生成不同格式的链接
  generateLinks() {
    console.log('\n=== URL 格式 ===');
    this.uploadedImages.forEach(img => {
      console.log(`${img.filename}: ${img.url}`);
    });

    console.log('\n=== Markdown 格式 ===');
    this.uploadedImages.forEach(img => {
      console.log(`![${img.filename}](${img.url})`);
    });

    console.log('\n=== HTML 格式 ===');
    this.uploadedImages.forEach(img => {
      console.log(`<img src="${img.url}" alt="${img.filename}">`);
    });

    console.log('\n=== BBCode 格式 ===');
    this.uploadedImages.forEach(img => {
      console.log(`[img]${img.url}[/img]`);
    });
  }

  // 保存链接到文件
  saveLinksToFile(filename: string = 'image-links.txt') {
    const content = this.uploadedImages.map(img => 
      `${img.filename}\n  URL: ${img.url}\n  Markdown: ![${img.filename}](${img.url})\n`
    ).join('\n');

    fs.writeFileSync(filename, content);
    console.log(`\n✅ 链接已保存到: ${filename}`);
  }

  // 清理旧图片
  async cleanOldImages(daysOld: number) {
    const listResult = await this.sdk.image.info.getImageList({
      parentFileId: 0,
      limit: 100,
    });

    if (listResult.code !== 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const oldImages = listResult.data.fileList.filter(img => {
      const createDate = new Date(img.createAt);
      return createDate < cutoffDate;
    });

    if (oldImages.length === 0) {
      console.log('没有需要删除的旧图片');
      return;
    }

    console.log(`找到 ${oldImages.length} 张超过 ${daysOld} 天的图片`);
    oldImages.forEach(img => {
      console.log(`- ${img.filename} (${img.createAt})`);
    });

    // 确认删除
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>(resolve => {
      rl.question('确认删除? (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'yes') {
      const result = await this.sdk.image.delete.deleteFiles({
        fileIds: oldImages.map(img => img.fileId),
      });

      if (result.code === 0) {
        console.log('✅ 已删除旧图片');
      }
    } else {
      console.log('已取消');
    }
  }
}

// 使用
async function main() {
  const sdk = new Pan123SDK({
  });

  const tool = new ImageHostingTool(sdk);

  // 上传图片
  await tool.uploadDirectory('./images');

  // 生成链接
  tool.generateLinks();

  // 保存到文件
  tool.saveLinksToFile('image-links.txt');

  // 清理30天前的图片
  // await tool.cleanOldImages(30);
}

main().catch(console.error);
```

## 注意事项

1. **图片格式**: 支持 JPG, PNG, GIF, WEBP 等常见格式
2. **文件大小**: 单张图片最大 20MB
3. **图片处理**: URL 参数处理（width/height）由服务器自动完成
4. **批量操作**: 复制、移动、删除支持批量，但有数量限制
5. **异步上传**: 大图片建议使用异步模式

