# 视频转码模块

视频转码模块（`video`）提供专业的视频转码服务，支持多分辨率转码。

## 模块说明

::: tip 💡 视频转码功能
- **多分辨率支持**：支持 2160P、1080P、720P、480P 等多种分辨率
- **H.264 编码**：使用主流的 H.264 编码格式
- **独立转码空间**：转码文件存储在独立空间（businessType=2）
- **从云盘上传**：从云盘空间上传视频到转码空间进行转码

**工作流程**：
1. 将视频文件上传到云盘（使用 `file` 模块）
2. 从云盘上传到转码空间（使用 `video.upload.fromCloudDisk`）
3. 获取可转码分辨率（使用 `video.info.getVideoResolutions`）
4. 提交转码任务（使用 `video.transcodeVideo`）
5. 查询转码进度（使用 `video.info.getTranscodeList`）
:::

## 子模块

视频模块包含以下子模块：

- `sdk.video.upload` - 视频上传
- `sdk.video.info` - 转码信息查询
- `sdk.video.transcodeVideo()` - 视频转码操作
- `sdk.video.getFileList()` - 转码空间文件列表
- `sdk.video.getTranscodeRecord()` - 查询转码记录
- `sdk.video.getTranscodeResult()` - 查询转码结果
- `sdk.video.deleteTranscodeVideo()` - 删除转码视频
- `sdk.video.download.*` - 视频下载模块

## 上传模块 (upload)

### fromCloudDisk()

从云盘空间上传视频到转码空间。

**参数**

```typescript
interface UploadFromCloudDiskParams {
  fileIds: (number | string)[];  // 云盘文件ID列表，最多100个
}
```

**示例**

```typescript
// 单个文件
const result = await sdk.video.upload.fromCloudDisk({
  fileIds: [12345],
});

// 批量上传（自动分批处理）
const batchResult = await sdk.video.upload.fromCloudDisk({
  fileIds: [12345, 67890, 111, 222, 333],  // SDK会自动处理批次
});

if (result.code === 0) {
  console.log('视频已上传到转码空间');
}
```

**返回值**

```typescript
interface UploadFromCloudDiskResponse {
  // 上传结果（具体结构根据API返回）
  [key: string]: any;
}
```

---

## 信息查询模块 (info)

### getFolderInfo()

获取转码空间的根文件夹ID。

**示例**

```typescript
const result = await sdk.video.info.getFolderInfo();

if (result.code === 0) {
  console.log('转码空间文件夹ID:', result.data.fileID);
}
```

**返回值**

```typescript
interface GetTranscodeFolderInfoResponse {
  fileID: number;  // 转码空间根文件夹ID
}
```

---

### getVideoResolutions()

获取视频文件可转码的分辨率（单次查询）。

**参数**

```typescript
{
  fileId: number | string;  // 文件ID
}
```

**示例**

```typescript
const result = await sdk.video.info.getVideoResolutions({
  fileId: 12345,
});

if (result.code === 0) {
  const data = result.data;
  
  if (data.IsGetResolution) {
    console.log('正在获取分辨率信息，请稍后重试...');
  } else {
    console.log('可转码分辨率:', data.Resolutions);
    console.log('已转码分辨率:', data.NowOrFinishedResolutions || '(从未转码)');
    console.log('编码方式:', data.CodecNames);
    console.log('视频时长:', data.VideoTime, '秒');
  }
}
```

**返回值**

```typescript
interface GetVideoResolutionsResponse {
  IsGetResolution: boolean;    // true=正在获取，false=已获取完成
  Resolutions: string;         // 可转码分辨率，如 "480p,720p,1080p"
  NowOrFinishedResolutions: string;  // 已转码的分辨率
  CodecNames: string;          // 编码方式，如 "H.264"
  VideoTime: number;           // 视频时长（秒）
}
```

---

### getVideoResolutionsWithPolling()

获取视频文件可转码的分辨率（自动轮询直到获取完成）。

**参数**

```typescript
interface GetVideoResolutionsWithPollingParams {
  fileId: number | string;    // 文件ID
  pollingInterval?: number;   // 轮询间隔（毫秒），默认10秒
  maxAttempts?: number;       // 最大轮询次数，默认30次
  onPolling?: (attempt: number, isGetting: boolean) => void;  // 轮询回调
}
```

**示例**

```typescript
const result = await sdk.video.info.getVideoResolutionsWithPolling({
  fileId: 12345,
  pollingInterval: 5000,   // 5秒轮询一次
  maxAttempts: 20,         // 最多轮询20次
  onPolling: (attempt, isGetting) => {
    console.log(`第 ${attempt} 次查询: ${isGetting ? '获取中...' : '已完成'}`);
  },
});

if (result.code === 0) {
  console.log('可转码分辨率:', result.data.Resolutions);
  console.log('已转码分辨率:', result.data.NowOrFinishedResolutions || '从未转码');
  
  // 解析可用分辨率
  const available = result.data.Resolutions.split(',');
  const finished = result.data.NowOrFinishedResolutions 
    ? result.data.NowOrFinishedResolutions.split(',') 
    : [];
  
  const pending = available.filter(r => !finished.includes(r));
  console.log('可新增转码:', pending.join(', '));
}
```

---

### getTranscodeList()

获取视频转码列表（需要授权 access_token）。

**参数**

```typescript
{
  fileId: number | string;  // 文件ID
}
```

**示例**

```typescript
const result = await sdk.video.info.getTranscodeList({
  fileId: 12345,
});

if (result.code === 0) {
  console.log('转码状态:', result.data.status);
  // 1=待转码, 3=转码失败, 254=部分成功, 255=全部成功
  
  console.log('转码列表:');
  result.data.list.forEach(item => {
    console.log(`- ${item.resolution} (${item.height}p)`);
    console.log(`  状态: ${item.status === 255 ? '成功' : '处理中'}`);
    console.log(`  进度: ${item.progress}%`);
    console.log(`  播放地址: ${item.url}`);
  });
}
```

**返回值**

```typescript
interface GetTranscodeListResponse {
  status: number;  // 1=待转码, 3=失败, 254=部分成功, 255=全部成功
  list: TranscodeListItem[];
}

interface TranscodeListItem {
  url: string;           // 转码后的视频地址
  resolution: string;    // 分辨率，如 "2160p"
  duration: number;      // 转码后的时长（秒）
  height: number;        // 视频高度（像素）
  status: number;        // 255=成功
  mc: string;           // 存储集群
  bitRate: number;      // 码率
  progress: number;     // 转码进度（0-100）
  updateAt: string;     // 更新时间
}
```

---

## 转码操作

### transcodeVideo()

启动视频转码任务。

**参数**

```typescript
interface TranscodeVideoParams {
  fileId: number | string;       // 文件ID
  codecName: string;             // 编码方式，如 "H.264"
  videoTime: number;             // 视频时长（秒）
  resolutions: string | string[]; // 要转码的分辨率
}
```

**示例**

```typescript
// 使用字符串数组
const result = await sdk.video.transcodeVideo({
  fileId: 12345,
  codecName: 'H.264',
  videoTime: 120,
  resolutions: ['2160P', '1080P', '720P'],  // 注意: P必须大写
});

// 使用逗号分隔字符串
const result2 = await sdk.video.transcodeVideo({
  fileId: 12345,
  codecName: 'H.264',
  videoTime: 120,
  resolutions: '2160P,1080P,720P',
});

if (result.code === 0) {
  console.log('转码任务已提交:', result.data);
  // "2160P&1080P&720P已成功开始转码，请在转码结果中查询"
}
```

**注意**: 
- 分辨率中的 `P` 必须大写，如 `2160P`、`1080P`、`720P`
- 不要重复转码已完成的分辨率

---

## 转码记录和结果查询

### getTranscodeRecord()

查询某个视频的转码记录（包含状态和m3u8链接）。

**参数**

```typescript
{
  fileId: number | string;  // 文件ID
}
```

**示例**

```typescript
const result = await sdk.video.getTranscodeRecord({
  fileId: 2875008,
});

if (result.code === 0) {
  const records = result.data.UserTranscodeVideoRecordList;
  
  records.forEach(record => {
    console.log(`分辨率: ${record.resolution}`);
    console.log(`状态: ${record.status === 255 ? '✅ 转码成功' : '⏳ 处理中'}`);
    console.log(`创建时间: ${record.create_at}`);
    
    if (record.status === 255 && record.link) {
      console.log(`m3u8链接: ${record.link}`);
    }
  });
}
```

**返回值**

```typescript
interface GetTranscodeRecordResponse {
  UserTranscodeVideoRecordList: TranscodeRecord[];
}

interface TranscodeRecord {
  create_at: string;    // 创建时间
  resolution: string;   // 分辨率，如 "720P"
  status: number;       // 1=准备转码, 2=转码中, 3-254=失败, 255=成功
  link: string;         // m3u8链接（仅成功时有值）
}
```

**状态说明**：
- `1`: 准备转码
- `2`: 正在转码中
- `3-254`: 转码失败，时长会自动回退
- `255`: 转码成功

---

### getTranscodeResult()

查询某个视频的转码结果（包含所有转码文件详情）。

**参数**

```typescript
{
  fileId: number | string;  // 文件ID
}
```

**示例**

```typescript
const result = await sdk.video.getTranscodeResult({
  fileId: 2875008,
});

if (result.code === 0) {
  const videoList = result.data.UserTranscodeVideoList;
  
  videoList.forEach(video => {
    console.log(`\n分辨率: ${video.Resolution}`);
    console.log(`状态: ${video.Status === 255 ? '✅ 成功' : '⏳ 处理中'}`);
    console.log(`创建时间: ${video.CreateAt}`);
    console.log(`更新时间: ${video.UpdateAt}`);
    
    console.log(`文件列表 (${video.Files.length} 个):`);
    video.Files.forEach(file => {
      console.log(`  - ${file.FileName} (${file.FileSize})`);
      if (file.Url) {
        console.log(`    URL: ${file.Url}`);
      }
    });
  });
}
```

**返回值**

```typescript
interface GetTranscodeResultResponse {
  UserTranscodeVideoList: TranscodeResult[];
}

interface TranscodeResult {
  Id: number;              // 记录ID
  Uid: number;             // 用户ID
  Resolution: string;      // 分辨率，如 "720P"
  Status: number;          // 1=准备转码, 2=转码中, 3-254=失败, 255=成功
  CreateAt: string;        // 创建时间
  UpdateAt: string;        // 更新时间
  Files: TranscodeFile[];  // 转码文件列表
}

interface TranscodeFile {
  FileName: string;     // 文件名，如 "stream.m3u8" 或 "000.ts"
  FileSize: string;     // 文件大小，如 "177B" 或 "497.17KB"
  Resolution: string;   // 分辨率
  CreateAt: string;     // 创建时间
  Url: string;          // 播放地址（m3u8有值，ts文件为空）
}
```

**区别说明**：
- `getTranscodeRecord()`: 简单的状态查询，只返回m3u8链接
- `getTranscodeResult()`: 详细的文件查询，返回所有m3u8和ts文件信息

---

## 删除转码视频

### deleteTranscodeVideo()

删除转码视频文件（原文件和/或转码文件）。

**参数**

```typescript
interface DeleteTranscodeVideoParams {
  fileId: number | string;  // 文件ID
  trashed: 1 | 2;           // 1=只删除原文件, 2=删除原文件+转码文件
}
```

**示例**

```typescript
// 只删除原文件
const result1 = await sdk.video.deleteTranscodeVideo({
  fileId: 2875061,
  trashed: 1,
});

// 删除原文件和所有转码文件
const result2 = await sdk.video.deleteTranscodeVideo({
  fileId: 2875061,
  trashed: 2,
});

if (result.code === 0) {
  console.log('✅', result.data);  // "删除文件成功"
}
```

**返回值**

```typescript
{
  code: 0,
  message: "ok",
  data: "删除文件成功"
}
```

**注意事项**：
- `trashed: 1` - 只删除原视频文件，保留转码文件
- `trashed: 2` - 删除原文件和所有分辨率的转码文件
- businessType 固定为 2（转码空间）
- 删除操作不可逆，请谨慎使用

---

## 视频下载模块 (download)

### downloadOriginalFile()

下载原视频文件。

**参数**

```typescript
{
  fileId: number | string;  // 文件ID
}
```

**示例**

```typescript
const result = await sdk.video.download.downloadOriginalFile({
  fileId: 2875008,
});

if (result.code === 0) {
  if (result.data.isFull) {
    console.warn('⚠️  转码空间已满，无法下载');
    console.log('请购买转码空间或删除旧文件');
  } else {
    console.log('✅ 下载地址:', result.data.downloadUrl);
    // 将地址放在浏览器中即可下载
  }
}
```

**返回值**

```typescript
interface DownloadOriginalFileResponse {
  downloadUrl: string;  // 下载地址（空间满时为空字符串）
  isFull: boolean;      // 转码空间是否已满
}
```

---

### downloadTranscodeFile()

下载单个转码文件（m3u8或ts）。

**参数**

```typescript
interface DownloadTranscodeFileParams {
  fileId: number | string;  // 文件ID
  resolution: string;       // 分辨率，如 "1080P"
  type: 1 | 2;              // 1=下载m3u8, 2=下载ts
  tsName?: string;          // ts文件名（type=2时必填）
}
```

**示例**

```typescript
// 下载m3u8文件
const m3u8Result = await sdk.video.download.downloadTranscodeFile({
  fileId: 2875008,
  resolution: '1080P',
  type: 1,
});

// 下载指定ts文件
const tsResult = await sdk.video.download.downloadTranscodeFile({
  fileId: 2875008,
  resolution: '1080P',
  type: 2,
  tsName: '001',  // ts文件名（不含扩展名）
});

if (m3u8Result.code === 0 && !m3u8Result.data.isFull) {
  console.log('m3u8下载地址:', m3u8Result.data.downloadUrl);
}

if (tsResult.code === 0 && !tsResult.data.isFull) {
  console.log('ts下载地址:', tsResult.data.downloadUrl);
}
```

**返回值**

```typescript
interface DownloadTranscodeFileResponse {
  downloadUrl: string;  // 下载地址
  isFull: boolean;      // 转码空间是否已满
}
```

**注意事项**：
- `type: 1` - 下载m3u8文件，不需要tsName
- `type: 2` - 下载ts文件，必须指定tsName
- tsName 从 `getTranscodeResult()` 结果中获取
- 分辨率必须使用大写P，如 `1080P`

---

### downloadAllTranscodeFiles()

下载某个视频的所有转码文件（单次查询）。

**参数**

```typescript
interface DownloadAllTranscodeFilesParams {
  fileId: number | string;  // 文件ID
  zipName: string;          // 下载的zip文件名
}
```

**示例**

```typescript
const result = await sdk.video.download.downloadAllTranscodeFiles({
  fileId: 2875054,
  zipName: '1080p_480p_222.mp4',
});

if (result.code === 0) {
  const { isDownloading, isFull, downloadUrl } = result.data;
  
  if (isFull) {
    console.warn('⚠️  转码空间已满');
  } else if (isDownloading) {
    console.log('⏳ 正在打包中，请稍后重试...');
  } else {
    console.log('✅ 下载地址:', downloadUrl);
  }
}
```

**返回值**

```typescript
interface DownloadAllTranscodeFilesResponse {
  isDownloading: boolean;  // true=正在打包, false=已完成
  isFull: boolean;         // true=空间已满, false=空间未满
  downloadUrl: string;     // 下载地址（打包完成且空间未满时有值）
}
```

**注意事项**：
- 这是一个异步操作，需要多次查询
- 建议使用 `downloadAllTranscodeFilesWithPolling()` 自动轮询

---

### downloadAllTranscodeFilesWithPolling()

下载所有转码文件（自动轮询直到打包完成）。

**参数**

```typescript
interface DownloadAllTranscodeFilesWithPollingParams {
  fileId: number | string;    // 文件ID
  zipName: string;            // zip文件名
  pollingInterval?: number;   // 轮询间隔（毫秒），默认10秒
  maxAttempts?: number;       // 最大轮询次数，默认30次
  onPolling?: (attempt: number, isDownloading: boolean, isFull: boolean) => void;
}
```

**示例**

```typescript
const result = await sdk.video.download.downloadAllTranscodeFilesWithPolling({
  fileId: 2875054,
  zipName: 'video_all_resolutions.mp4',
  pollingInterval: 10000,  // 10秒轮询一次
  maxAttempts: 20,         // 最多轮询20次
  onPolling: (attempt, isDownloading, isFull) => {
    if (isFull) {
      console.log(`第 ${attempt} 次查询: 空间已满`);
    } else if (isDownloading) {
      console.log(`第 ${attempt} 次查询: 正在打包...`);
    } else {
      console.log(`第 ${attempt} 次查询: 打包完成`);
    }
  },
});

if (result.code === 0) {
  if (result.data.isFull) {
    console.error('❌ 转码空间已满，请清理空间');
  } else {
    console.log('✅ 下载地址:', result.data.downloadUrl);
    console.log('文件包含所有分辨率的转码文件');
  }
}
```

**返回值**

同 `downloadAllTranscodeFiles()`

**优势**：
- 自动处理轮询逻辑
- 支持自定义轮询间隔和最大次数
- 提供回调函数监控进度
- 打包完成后自动返回结果

---

## 文件列表

### getFileList()

获取转码空间的文件列表。

**参数**

```typescript
interface GetFileListParams {
  parentFileId: number;      // 文件夹ID，根目录传0
  limit: number;             // 每页数量，最大100
  searchData?: string;       // 搜索关键字（选填）
  searchMode?: 0 | 1;        // 0=模糊搜索, 1=精准搜索（选填）
  lastFileId?: number;       // 翻页ID（选填）
}
```

**示例**

```typescript
const result = await sdk.video.getFileList({
  parentFileId: 0,    // 根目录
  limit: 50,
  searchData: 'video',  // 搜索包含"video"的文件
});

if (result.code === 0) {
  console.log(`找到 ${result.data.fileList.length} 个文件`);
  
  result.data.fileList.forEach(file => {
    console.log(`- ${file.filename}`);
    console.log(`  文件ID: ${file.fileId}`);
    console.log(`  大小: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  类型: ${file.type === 0 ? '文件' : '文件夹'}`);
  });
  
  // 翻页
  if (result.data.lastFileId !== -1) {
    console.log('还有更多文件，lastFileId:', result.data.lastFileId);
  }
}
```

## 完整示例

### 基础转码流程

```typescript
import Pan123SDK from '@123pan/api-sdk';

async function videoTranscodeWorkflow() {
  const sdk = new Pan123SDK({
  });

  const cloudDiskFileId = 12345;  // 云盘中的视频文件ID

  try {
    // 1. 从云盘上传到转码空间
    console.log('步骤1: 上传视频到转码空间...');
    const uploadResult = await sdk.video.upload.fromCloudDisk({
      fileIds: [cloudDiskFileId],
    });

    if (uploadResult.code !== 0) {
      console.error('上传失败:', uploadResult.message);
      return;
    }
    console.log('✅ 上传成功');

    // 2. 获取转码空间文件列表
    console.log('\n步骤2: 查询转码空间文件...');
    const fileListResult = await sdk.video.getFileList({
      parentFileId: 0,
      limit: 10,
    });

    if (fileListResult.code === 0) {
      const videoFile = fileListResult.data.fileList[0];
      console.log('找到视频文件:', videoFile.filename);
      
      const transcodeFileId = videoFile.fileId;

      // 3. 获取可转码分辨率（带轮询）
      console.log('\n步骤3: 获取可转码分辨率...');
      const resolutionsResult = await sdk.video.info.getVideoResolutionsWithPolling({
        fileId: transcodeFileId,
        pollingInterval: 5000,
        maxAttempts: 20,
        onPolling: (attempt, isGetting) => {
          console.log(`  查询第 ${attempt} 次: ${isGetting ? '获取中...' : '完成'}`);
        },
      });

      if (resolutionsResult.code === 0) {
        const { Resolutions, NowOrFinishedResolutions, CodecNames, VideoTime } = resolutionsResult.data;
        
        console.log('✅ 分辨率信息获取成功');
        console.log('- 可转码:', Resolutions);
        console.log('- 已转码:', NowOrFinishedResolutions || '(从未转码)');
        console.log('- 编码:', CodecNames);
        console.log('- 时长:', VideoTime, '秒');

        // 计算需要转码的分辨率
        const available = Resolutions.split(',').filter(r => r);
        const finished = NowOrFinishedResolutions 
          ? NowOrFinishedResolutions.split(',').filter(r => r)
          : [];
        const pending = available.filter(r => !finished.includes(r));

        if (pending.length > 0) {
          // 4. 提交转码任务
          console.log('\n步骤4: 提交转码任务...');
          console.log('要转码的分辨率:', pending.join(', '));

          const transcodeResult = await sdk.video.transcodeVideo({
            fileId: transcodeFileId,
            codecName: CodecNames,
            videoTime: VideoTime,
            resolutions: pending,
          });

          if (transcodeResult.code === 0) {
            console.log('✅ 转码任务已提交:', transcodeResult.data);

            // 5. 查询转码进度
            console.log('\n步骤5: 查询转码进度...');
            await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒

            const listResult = await sdk.video.info.getTranscodeList({
              fileId: transcodeFileId,
            });

            if (listResult.code === 0) {
              console.log(`转码状态: ${listResult.data.status}`);
              listResult.data.list.forEach(item => {
                console.log(`\n- ${item.resolution}`);
                console.log(`  进度: ${item.progress}%`);
                console.log(`  状态: ${item.status === 255 ? '✅ 完成' : '⏳ 处理中'}`);
                if (item.status === 255) {
                  console.log(`  播放地址: ${item.url}`);
                }
              });
            }
          }
        } else {
          console.log('所有分辨率均已转码完成');
        }
      }
    }
  } catch (error) {
    console.error('操作失败:', error);
  }
}

videoTranscodeWorkflow();
```

### 完整工作流（包含查询和下载）

```typescript
async function completeVideoWorkflow() {
  const sdk = new Pan123SDK({
  });

  const fileId = 2875008;

  try {
    // 1. 查询转码记录
    console.log('步骤1: 查询转码记录...');
    const recordResult = await sdk.video.getTranscodeRecord({
      fileId,
    });

    if (recordResult.code === 0) {
      console.log('\n转码记录:');
      recordResult.data.UserTranscodeVideoRecordList.forEach(record => {
        const statusText = record.status === 255 ? '✅ 成功' : 
                          record.status === 2 ? '⏳ 转码中' : 
                          record.status === 1 ? '⏰ 准备中' : '❌ 失败';
        
        console.log(`- ${record.resolution}: ${statusText}`);
        console.log(`  创建时间: ${record.create_at}`);
        if (record.link) {
          console.log(`  m3u8: ${record.link}`);
        }
      });
    }

    // 2. 查询详细转码结果
    console.log('\n步骤2: 查询详细转码结果...');
    const resultDetail = await sdk.video.getTranscodeResult({
      fileId,
    });

    if (resultDetail.code === 0) {
      console.log('\n转码文件详情:');
      resultDetail.data.UserTranscodeVideoList.forEach(video => {
        console.log(`\n${video.Resolution}:`);
        console.log(`  状态: ${video.Status === 255 ? '✅ 成功' : '⏳ 处理中'}`);
        console.log(`  更新时间: ${video.UpdateAt}`);
        console.log(`  文件数量: ${video.Files.length}`);
        
        video.Files.forEach(file => {
          console.log(`    - ${file.FileName} (${file.FileSize})`);
          if (file.Url) {
            console.log(`      播放: ${file.Url}`);
          }
        });
      });
    }

    // 3. 下载原文件
    console.log('\n步骤3: 下载原视频文件...');
    const downloadOriginal = await sdk.video.download.downloadOriginalFile({
      fileId,
    });

    if (downloadOriginal.code === 0) {
      if (downloadOriginal.data.isFull) {
        console.warn('⚠️  转码空间已满，无法下载原文件');
      } else {
        console.log('✅ 原文件下载地址:', downloadOriginal.data.downloadUrl);
      }
    }

    // 4. 下载特定分辨率的m3u8文件
    console.log('\n步骤4: 下载1080P的m3u8文件...');
    const downloadM3u8 = await sdk.video.download.downloadTranscodeFile({
      fileId,
      resolution: '1080P',
      type: 1,
    });

    if (downloadM3u8.code === 0 && !downloadM3u8.data.isFull) {
      console.log('✅ m3u8下载地址:', downloadM3u8.data.downloadUrl);
    }

    // 5. 下载特定ts文件
    console.log('\n步骤5: 下载1080P的ts文件...');
    const downloadTs = await sdk.video.download.downloadTranscodeFile({
      fileId,
      resolution: '1080P',
      type: 2,
      tsName: '000',  // 从getTranscodeResult获取的文件名
    });

    if (downloadTs.code === 0 && !downloadTs.data.isFull) {
      console.log('✅ ts下载地址:', downloadTs.data.downloadUrl);
    }

    // 6. 下载所有转码文件（自动轮询）
    console.log('\n步骤6: 下载所有转码文件...');
    const downloadAll = await sdk.video.download.downloadAllTranscodeFilesWithPolling({
      fileId,
      zipName: 'video_all_resolutions.mp4',
      pollingInterval: 10000,
      maxAttempts: 20,
      onPolling: (attempt, isDownloading, isFull) => {
        if (isFull) {
          console.log(`  第 ${attempt} 次: 空间已满`);
        } else if (isDownloading) {
          console.log(`  第 ${attempt} 次: 正在打包...`);
        } else {
          console.log(`  第 ${attempt} 次: ✅ 打包完成`);
        }
      },
    });

    if (downloadAll.code === 0) {
      if (downloadAll.data.isFull) {
        console.error('❌ 空间已满');
      } else {
        console.log('✅ 所有转码文件下载地址:', downloadAll.data.downloadUrl);
      }
    }

    // 7. （可选）删除转码视频
    // console.log('\n步骤7: 删除转码视频（谨慎操作）...');
    // const deleteResult = await sdk.video.deleteTranscodeVideo({
    //   fileId,
    //   trashed: 2,  // 删除原文件和所有转码文件
    // });
    // 
    // if (deleteResult.code === 0) {
    //   console.log('✅ 删除成功:', deleteResult.data);
    // }

    console.log('\n🎉 完整工作流程执行完毕！');
  } catch (error) {
    console.error('操作失败:', error);
  }
}

completeVideoWorkflow();
```

### 批量转码管理

```typescript
async function batchTranscodeManagement() {
  const sdk = new Pan123SDK({
  });

  try {
    // 1. 批量上传多个视频
    console.log('步骤1: 批量上传视频到转码空间...');
    const cloudFileIds = [12345, 67890, 111213, 141516];
    
    const uploadResult = await sdk.video.upload.fromCloudDisk({
      fileIds: cloudFileIds,  // SDK会自动分批处理
    });

    if (uploadResult.code === 0) {
      console.log(`✅ 成功上传 ${cloudFileIds.length} 个视频`);
    }

    // 2. 获取转码空间所有文件
    console.log('\n步骤2: 获取转码空间文件列表...');
    const fileList = await sdk.video.getFileList({
      parentFileId: 0,
      limit: 100,
    });

    if (fileList.code === 0) {
      const videos = fileList.data.fileList.filter(f => f.type === 0);
      console.log(`找到 ${videos.length} 个视频文件`);

      // 3. 批量提交转码任务
      console.log('\n步骤3: 批量提交转码任务...');
      for (const video of videos) {
        console.log(`\n处理视频: ${video.filename}`);
        
        // 获取可转码分辨率
        const resolutions = await sdk.video.info.getVideoResolutionsWithPolling({
          fileId: video.fileId,
          pollingInterval: 5000,
          maxAttempts: 10,
          onPolling: (attempt) => {
            console.log(`  查询分辨率 (第 ${attempt} 次)...`);
          },
        });

        if (resolutions.code === 0 && !resolutions.data.IsGetResolution) {
          const available = resolutions.data.Resolutions.split(',').filter(r => r);
          const finished = resolutions.data.NowOrFinishedResolutions
            ? resolutions.data.NowOrFinishedResolutions.split(',').filter(r => r)
            : [];
          const pending = available.filter(r => !finished.includes(r));

          if (pending.length > 0) {
            console.log(`  提交转码: ${pending.join(', ')}`);
            
            await sdk.video.transcodeVideo({
              fileId: video.fileId,
              codecName: resolutions.data.CodecNames,
              videoTime: resolutions.data.VideoTime,
              resolutions: pending,
            });
            
            console.log('  ✅ 转码任务已提交');
          } else {
            console.log('  ⏭️  已全部转码完成');
          }
        }

        // 延迟避免频繁调用
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 4. 批量查询转码状态
      console.log('\n步骤4: 批量查询转码状态...');
      await new Promise(resolve => setTimeout(resolve, 30000));  // 等待30秒

      for (const video of videos) {
        const record = await sdk.video.getTranscodeRecord({
          fileId: video.fileId,
        });

        if (record.code === 0) {
          console.log(`\n${video.filename}:`);
          record.data.UserTranscodeVideoRecordList.forEach(r => {
            const status = r.status === 255 ? '✅ 成功' :
                          r.status === 2 ? '⏳ 转码中' : '⏰ 准备中';
            console.log(`  ${r.resolution}: ${status}`);
          });
        }
      }
    }

    console.log('\n🎉 批量转码管理完成！');
  } catch (error) {
    console.error('操作失败:', error);
  }
}

batchTranscodeManagement();
```

### 转码空间清理

```typescript
async function cleanupTranscodeSpace() {
  const sdk = new Pan123SDK({
  });

  try {
    // 1. 获取所有文件
    console.log('步骤1: 获取转码空间所有文件...');
    const fileList = await sdk.video.getFileList({
      parentFileId: 0,
      limit: 100,
    });

    if (fileList.code === 0) {
      const videos = fileList.data.fileList.filter(f => f.type === 0);
      console.log(`共 ${videos.length} 个视频文件`);

      // 2. 分析每个文件
      const summary = {
        total: videos.length,
        withTranscode: 0,
        withoutTranscode: 0,
        totalSize: 0,
      };

      for (const video of videos) {
        summary.totalSize += video.size;

        const record = await sdk.video.getTranscodeRecord({
          fileId: video.fileId,
        });

        if (record.code === 0 && record.data.UserTranscodeVideoRecordList.length > 0) {
          const hasSuccess = record.data.UserTranscodeVideoRecordList.some(r => r.status === 255);
          if (hasSuccess) {
            summary.withTranscode++;
          } else {
            summary.withoutTranscode++;
          }
        } else {
          summary.withoutTranscode++;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 3. 显示统计
      console.log('\n📊 转码空间统计:');
      console.log(`  总文件数: ${summary.total}`);
      console.log(`  已转码: ${summary.withTranscode}`);
      console.log(`  未转码: ${summary.withoutTranscode}`);
      console.log(`  总大小: ${(summary.totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

      // 4. （可选）删除未转码或转码失败的文件
      console.log('\n是否清理未转码的文件？（需手动确认）');
      // for (const video of videos) {
      //   const record = await sdk.video.getTranscodeRecord({
      //     fileId: video.fileId,
      //   });
      //
      //   if (record.code === 0) {
      //     const hasSuccess = record.data.UserTranscodeVideoRecordList.some(r => r.status === 255);
      //     
      //     if (!hasSuccess) {
      //       console.log(`删除: ${video.filename}`);
      //       await sdk.video.deleteTranscodeVideo({
      //         fileId: video.fileId,
      //         trashed: 2,  // 删除原文件和转码文件
      //       });
      //     }
      //   }
      // }

      console.log('\n✅ 空间分析完成');
    }
  } catch (error) {
    console.error('操作失败:', error);
  }
}

cleanupTranscodeSpace();
```

## 注意事项

### 通用注意事项

1. **视频格式**: 支持常见视频格式（MP4, AVI, MKV 等）
2. **文件大小**: 视频文件大小限制取决于账号配额
3. **转码时长**: 转码时间取决于视频时长和分辨率
4. **分辨率格式**: 必须使用大写 P，如 `2160P`、`1080P`、`720P`
5. **重复转码**: 避免重复提交已转码的分辨率
6. **空间类型**: 转码空间（businessType=2）与云盘空间独立
7. **轮询建议**: 查询分辨率信息建议间隔 10 秒轮询
8. **授权要求**: `getTranscodeList` 方法需要授权 access_token

### 上传注意事项

1. **文件ID**: 必须是云盘空间的文件ID
2. **批量限制**: 最多支持100个文件ID
3. **自动分批**: SDK会自动处理超过100个的批次
4. **重复上传**: 同一文件可能不能重复上传

### 转码注意事项

1. **分辨率格式**: 
   - 必须使用大写 `P`：`2160P`、`1080P`、`720P`、`480P`
   - 可以使用字符串数组或逗号分隔字符串
2. **避免重复**: 
   - 使用 `getVideoResolutions()` 查询已转码分辨率
   - 从可转码列表中排除已转码的分辨率
3. **编码方式**: 
   - 通常使用 `H.264`
   - 从 `getVideoResolutions()` 结果中获取
4. **视频时长**: 
   - 单位为秒
   - 从 `getVideoResolutions()` 结果中获取

### 查询注意事项

1. **转码记录** (`getTranscodeRecord`):
   - 返回简单的状态信息
   - 包含 m3u8 播放链接
   - 适合快速查询状态
2. **转码结果** (`getTranscodeResult`):
   - 返回详细的文件信息
   - 包含所有 m3u8 和 ts 文件
   - 适合获取完整文件列表
3. **状态值**:
   - `1`: 准备转码
   - `2`: 正在转码中
   - `3-254`: 转码失败
   - `255`: 转码成功

### 下载注意事项

1. **空间限制**: 
   - 转码空间满时 `isFull` 为 `true`
   - 此时无法下载，需要清理空间
2. **原文件下载**:
   - 下载原始上传的视频文件
   - 不受转码影响
3. **转码文件下载**:
   - `type: 1` - 下载 m3u8 文件
   - `type: 2` - 下载 ts 文件，需指定 `tsName`
   - ts文件名从 `getTranscodeResult()` 获取
4. **批量下载**:
   - 异步操作，需要轮询
   - 建议使用 `downloadAllTranscodeFilesWithPolling()`
   - 建议轮询间隔 10 秒
5. **下载地址**:
   - 返回的是临时下载链接
   - 直接在浏览器中访问即可下载
   - 链接可能有时效限制

### 删除注意事项

1. **trashed 参数**:
   - `1`: 只删除原文件，保留所有转码文件
   - `2`: 删除原文件和所有分辨率的转码文件
2. **不可逆操作**: 
   - 删除操作不可恢复
   - 建议先备份重要文件
3. **businessType**: 
   - 固定为 2（转码空间）
   - SDK自动处理
4. **批量删除**: 
   - 需要逐个调用API
   - 建议添加确认机制

### 性能优化

1. **批量操作**: 
   - 多个文件上传时一次调用 `fromCloudDisk()`
   - SDK会自动分批处理
2. **轮询间隔**: 
   - 分辨率查询：10秒
   - 下载打包：10秒
   - 避免过于频繁的请求
3. **并发控制**: 
   - 避免同时处理大量文件
   - 建议使用队列控制并发数
4. **错误重试**: 
   - 网络错误建议重试
   - 转码失败检查视频格式

### 最佳实践

1. **完整流程**:
   ```typescript
   // 1. 上传到转码空间
   await sdk.video.upload.fromCloudDisk({ fileIds: [id] });
   
   // 2. 获取可转码分辨率（轮询）
   const res = await sdk.video.info.getVideoResolutionsWithPolling({ fileId: id });
   
   // 3. 提交转码任务
   await sdk.video.transcodeVideo({
     fileId: id,
     codecName: res.data.CodecNames,
     videoTime: res.data.VideoTime,
     resolutions: pendingResolutions,
   });
   
   // 4. 查询转码状态
   await sdk.video.getTranscodeRecord({ fileId: id });
   
   // 5. 下载转码结果
   await sdk.video.download.downloadAllTranscodeFilesWithPolling({
     fileId: id,
     zipName: 'video.mp4',
   });
   ```

2. **错误处理**:
   ```typescript
   try {
     const result = await sdk.video.transcodeVideo(params);
     if (result.code === 0) {
       console.log('成功');
     } else {
       console.error('失败:', result.message);
     }
   } catch (error) {
     console.error('异常:', error.message);
     // 重试或记录日志
   }
   ```

3. **状态监控**:
   ```typescript
   // 定期检查转码状态
   const checkStatus = async (fileId: number) => {
     const record = await sdk.video.getTranscodeRecord({ fileId });
     
     const allSuccess = record.data.UserTranscodeVideoRecordList
       .every(r => r.status === 255);
     
     if (allSuccess) {
       console.log('所有转码完成');
       return true;
     }
     
     return false;
   };
   
   // 轮询检查
   const interval = setInterval(async () => {
     const done = await checkStatus(fileId);
     if (done) {
       clearInterval(interval);
     }
   }, 30000);  // 每30秒检查一次
   ```

4. **空间管理**:
   ```typescript
   // 定期检查空间使用情况
   const checkSpace = async () => {
     const result = await sdk.video.download.downloadOriginalFile({ fileId: 1 });
     
     if (result.data.isFull) {
       console.warn('转码空间已满，需要清理');
       // 触发清理流程
     }
   };
   ```

## 官方文档

本模块基于 [123Pan 开放平台官方文档](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced) 实现。

所有用到的 123Pan Logo、品牌标识、相关图标及文字等知识产权归 123云盘官方所有，如有侵权请联系删除。

