# 离线下载示例

本章节展示离线下载模块的实际使用案例。

## 创建离线任务

### 创建单个离线任务

```typescript
import Pan123SDK from '@sharef/123pan-sdk';

const sdk = new Pan123SDK({
});

async function createOfflineTask() {
  const result = await sdk.offline.createTask({
    url: 'https://example.com/large-file.zip',
    parentId: 0,  // 0 表示根目录
  });

  if (result.code === 0) {
    console.log('✅ 离线任务创建成功!');
    console.log('任务ID:', result.data.taskId);
    console.log('文件名:', result.data.fileName);
    console.log('文件大小:', (result.data.fileSize / 1024 / 1024).toFixed(2), 'MB');
    return result.data.taskId;
  } else {
    console.error('创建失败:', result.message);
    return null;
  }
}
```

### 创建到指定文件夹

```typescript
async function createTaskToFolder(url: string, folderId: number) {
  const result = await sdk.offline.createTask({
    url,
    parentId: folderId,  // 指定文件夹ID
  });

  if (result.code === 0) {
    console.log(`✅ 任务已创建到文件夹 ${folderId}`);
    return result.data;
  }
  return null;
}

// 使用
await createTaskToFolder('https://example.com/file.zip', 12345);
```

### 批量创建离线任务

```typescript
async function batchCreateTasks(urls: string[]) {
  console.log(`准备创建 ${urls.length} 个离线任务\n`);

  const result = await sdk.offline.batchCreateTasks({
    urls,
    parentId: 0,
  });

  if (result.code === 0) {
    console.log(`✅ 成功创建 ${result.data.length} 个任务`);
    
    result.data.forEach((task, index) => {
      console.log(`\n${index + 1}. ${task.fileName}`);
      console.log(`   任务ID: ${task.taskId}`);
      console.log(`   大小: ${(task.fileSize / 1024 / 1024).toFixed(2)} MB`);
    });

    return result.data;
  } else {
    console.error('批量创建失败:', result.message);
    return [];
  }
}

// 使用
const urls = [
  'https://example.com/file1.zip',
  'https://example.com/file2.zip',
  'https://example.com/file3.zip',
];

await batchCreateTasks(urls);
```

## 查询下载进度

### 查询单个任务进度

```typescript
async function checkProgress(taskID: number) {
  const result = await sdk.offline.getDownloadProcess({
    taskID,
  });

  if (result.code === 0) {
    const { process, status } = result.data;
    
    console.log('下载进度:', process, '%');
    console.log('任务状态:', getStatusText(status));

    return { process, status };
  }
  return null;
}

function getStatusText(status: number): string {
  const statusMap = {
    0: '⏳ 进行中',
    1: '❌ 下载失败',
    2: '✅ 下载成功',
    3: '🔄 重试中',
  };
  return statusMap[status] || '未知';
}
```

### 轮询查询直到完成

```typescript
async function waitForCompletion(taskID: number) {
  console.log('开始监控下载进度...\n');

  const pollInterval = 5000;  // 5秒查询一次
  const maxAttempts = 120;    // 最多查询10分钟

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sdk.offline.getDownloadProcess({
      taskID,
    });

    if (result.code !== 0) {
      console.error('查询失败:', result.message);
      break;
    }

    const { process, status } = result.data;
    
    // 清除上一行输出
    process.stdout.write(`\r[查询 ${attempt}/${maxAttempts}] 进度: ${process}% | 状态: ${getStatusText(status)}`);

    // 检查是否完成
    if (status === 2) {
      console.log('\n\n✅ 下载成功!');
      return true;
    } else if (status === 1) {
      console.log('\n\n❌ 下载失败');
      return false;
    }

    // 等待后继续
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  console.log('\n\n⏰ 查询超时');
  return false;
}

// 使用
const taskID = 12345;
const success = await waitForCompletion(taskID);
```

### 批量查询进度

```typescript
async function batchCheckProgress(taskIDs: number[]) {
  console.log('=== 批量查询进度 ===\n');

  for (const taskID of taskIDs) {
    const result = await sdk.offline.getDownloadProcess({
      taskID,
    });

    if (result.code === 0) {
      const { process, status } = result.data;
      console.log(`任务 ${taskID}:`);
      console.log(`  进度: ${process}%`);
      console.log(`  状态: ${getStatusText(status)}`);
      console.log('');
    }
  }
}

// 使用
const taskIDs = [12345, 67890, 111, 222];
await batchCheckProgress(taskIDs);
```

## 任务列表管理

### 获取所有任务

```typescript
async function getAllTasks() {
  const result = await sdk.offline.getTaskList({
    page: 1,
    limit: 50,
  });

  if (result.code === 0) {
    console.log(`共有 ${result.data.total} 个离线任务\n`);
    
    result.data.list.forEach((task, index) => {
      console.log(`${index + 1}. ${task.fileName}`);
      console.log(`   任务ID: ${task.taskId}`);
      console.log(`   状态: ${task.status}`);
      console.log(`   进度: ${task.progress}%`);
      console.log(`   创建时间: ${task.createTime}`);
      console.log('');
    });

    return result.data;
  }
  return null;
}
```

### 分页获取任务

```typescript
async function getTasksByPage(page: number, limit: number = 20) {
  const result = await sdk.offline.getTaskList({
    page,
    limit,
  });

  if (result.code === 0) {
    const { total, list } = result.data;
    const totalPages = Math.ceil(total / limit);
    
    console.log(`第 ${page}/${totalPages} 页 (共 ${total} 个任务)\n`);
    
    list.forEach((task, index) => {
      const number = (page - 1) * limit + index + 1;
      console.log(`${number}. ${task.fileName} - ${task.status}`);
    });

    return { total, totalPages, list };
  }
  return null;
}

// 使用
await getTasksByPage(1, 10);
await getTasksByPage(2, 10);
```

### 筛选特定状态的任务

```typescript
async function getTasksByStatus(targetStatus: string) {
  const result = await sdk.offline.getTaskList({
    page: 1,
    limit: 100,
  });

  if (result.code !== 0) return [];

  const filteredTasks = result.data.list.filter(task => 
    task.status === targetStatus
  );

  console.log(`找到 ${filteredTasks.length} 个状态为 "${targetStatus}" 的任务\n`);
  
  filteredTasks.forEach(task => {
    console.log(`- ${task.fileName} (ID: ${task.taskId})`);
  });

  return filteredTasks;
}

// 获取所有正在下载的任务
await getTasksByStatus('downloading');

// 获取所有已完成的任务
await getTasksByStatus('completed');

// 获取所有失败的任务
await getTasksByStatus('failed');
```

## 任务控制

### 暂停任务

```typescript
async function pauseTask(taskId: string) {
  const result = await sdk.offline.pauseTask(taskId);

  if (result.code === 0) {
    console.log(`✅ 任务 ${taskId} 已暂停`);
    return true;
  } else {
    console.error('暂停失败:', result.message);
    return false;
  }
}
```

### 恢复任务

```typescript
async function resumeTask(taskId: string) {
  const result = await sdk.offline.resumeTask(taskId);

  if (result.code === 0) {
    console.log(`✅ 任务 ${taskId} 已恢复`);
    return true;
  } else {
    console.error('恢复失败:', result.message);
    return false;
  }
}
```

### 删除任务

```typescript
async function deleteTask(taskId: string) {
  const result = await sdk.offline.deleteTask(taskId);

  if (result.code === 0) {
    console.log(`✅ 任务 ${taskId} 已删除`);
    return true;
  } else {
    console.error('删除失败:', result.message);
    return false;
  }
}
```

### 批量删除失败的任务

```typescript
async function cleanFailedTasks() {
  // 1. 获取所有任务
  const listResult = await sdk.offline.getTaskList({
    page: 1,
    limit: 100,
  });

  if (listResult.code !== 0) return;

  // 2. 找出失败的任务
  const failedTasks = listResult.data.list.filter(task => 
    task.status === 'failed'
  );

  if (failedTasks.length === 0) {
    console.log('没有失败的任务');
    return;
  }

  console.log(`找到 ${failedTasks.length} 个失败的任务\n`);

  // 3. 批量删除
  let deletedCount = 0;

  for (const task of failedTasks) {
    console.log(`删除: ${task.fileName}`);
    
    const result = await sdk.offline.deleteTask(task.taskId);
    
    if (result.code === 0) {
      deletedCount++;
      console.log('  ✅ 已删除');
    } else {
      console.log('  ❌ 删除失败');
    }
  }

  console.log(`\n完成! 已删除 ${deletedCount}/${failedTasks.length} 个任务`);
}
```

## 完整示例：离线下载管理工具

```typescript
import Pan123SDK from '@sharef/123pan-sdk';
import * as fs from 'fs';

class OfflineDownloadManager {
  private sdk: Pan123SDK;

  constructor(sdk: Pan123SDK) {
    this.sdk = sdk;
  }

  // 从文件读取URL列表并批量创建任务
  async createTasksFromFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const urls = content.split('\n').filter(line => 
      line.trim() && line.startsWith('http')
    );

    console.log(`从文件读取到 ${urls.length} 个URL\n`);

    const result = await this.sdk.offline.batchCreateTasks({
      urls,
      parentId: 0,
    });

    if (result.code === 0) {
      console.log(`✅ 成功创建 ${result.data.length} 个任务`);
      return result.data.map(task => task.taskId);
    }

    return [];
  }

  // 监控多个任务的下载进度
  async monitorMultipleTasks(taskIDs: number[]) {
    console.log(`监控 ${taskIDs.length} 个下载任务\n`);

    const startTime = Date.now();
    let allCompleted = false;

    while (!allCompleted && (Date.now() - startTime < 600000)) {  // 最多10分钟
      console.clear();
      console.log('=== 离线下载进度监控 ===\n');

      const statuses = [];

      for (const taskID of taskIDs) {
        const result = await this.sdk.offline.getDownloadProcess({
          taskID,
        });

        if (result.code === 0) {
          const { process, status } = result.data;
          statuses.push({ taskID, process, status });

          const statusIcon = this.getStatusIcon(status);
          console.log(`${statusIcon} 任务 ${taskID}: ${process}%`);
        }
      }

      // 检查是否全部完成
      allCompleted = statuses.every(s => s.status === 2 || s.status === 1);

      if (allCompleted) {
        const successCount = statuses.filter(s => s.status === 2).length;
        const failCount = statuses.filter(s => s.status === 1).length;

        console.log('\n=== 下载完成 ===');
        console.log(`✅ 成功: ${successCount}`);
        console.log(`❌ 失败: ${failCount}`);
        break;
      }

      // 等待5秒后继续
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // 生成下载报告
  async generateReport() {
    const listResult = await this.sdk.offline.getTaskList({
      page: 1,
      limit: 100,
    });

    if (listResult.code !== 0) return;

    const tasks = listResult.data.list;

    console.log('=== 离线下载报告 ===\n');
    console.log(`总任务数: ${tasks.length}\n`);

    // 统计各状态任务数
    const statusCounts: Record<string, number> = {};
    tasks.forEach(task => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });

    console.log('状态统计:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} 个`);
    });

    // 计算总文件大小
    const totalSize = tasks.reduce((sum, task) => sum + task.fileSize, 0);
    console.log(`\n总文件大小: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

    // 最近的任务
    console.log('\n最近5个任务:');
    tasks.slice(0, 5).forEach(task => {
      console.log(`  - ${task.fileName} (${task.createTime})`);
    });
  }

  // 自动重试失败的任务
  async retryFailedTasks() {
    // 获取失败的任务
    const listResult = await this.sdk.offline.getTaskList({
      page: 1,
      limit: 100,
    });

    if (listResult.code !== 0) return;

    const failedTasks = listResult.data.list.filter(task => 
      task.status === 'failed'
    );

    if (failedTasks.length === 0) {
      console.log('没有失败的任务需要重试');
      return;
    }

    console.log(`找到 ${failedTasks.length} 个失败的任务，准备重试\n`);

    for (const task of failedTasks) {
      console.log(`重试: ${task.fileName}`);

      // 删除旧任务
      await this.sdk.offline.deleteTask(task.taskId);

      // 创建新任务（使用原URL）
      // 注意: 需要保存原URL才能重试
      console.log('  已删除旧任务，请手动创建新任务');
    }
  }

  // 辅助方法
  private getStatusIcon(status: number): string {
    const icons = {
      0: '⏳',
      1: '❌',
      2: '✅',
      3: '🔄',
    };
    return icons[status] || '❓';
  }
}

// 使用
async function main() {
  const sdk = new Pan123SDK({
  });

  const manager = new OfflineDownloadManager(sdk);

  // 从文件创建任务
  // const taskIDs = await manager.createTasksFromFile('./urls.txt');

  // 监控任务
  // if (taskIDs.length > 0) {
  //   await manager.monitorMultipleTasks(taskIDs);
  // }

  // 生成报告
  await manager.generateReport();

  // 重试失败的任务
  // await manager.retryFailedTasks();
}

main().catch(console.error);
```

## 定时任务示例

### 定时检查并报告

```typescript
import * as cron from 'node-cron';

function startMonitoring() {
  // 每5分钟检查一次
  cron.schedule('*/5 * * * *', async () => {
    console.log('\n⏰ 定时检查离线任务...');

    const result = await sdk.offline.getTaskList({
      page: 1,
      limit: 50,
    });

    if (result.code === 0) {
      const downloading = result.data.list.filter(t => t.status === 'downloading');
      const completed = result.data.list.filter(t => t.status === 'completed');
      const failed = result.data.list.filter(t => t.status === 'failed');

      console.log(`📊 统计:`);
      console.log(`  下载中: ${downloading.length}`);
      console.log(`  已完成: ${completed.length}`);
      console.log(`  失败: ${failed.length}`);

      // 如果有新完成的，发送通知
      if (completed.length > 0) {
        // 发送邮件/推送通知
        console.log('✅ 有任务完成，已发送通知');
      }
    }
  });

  console.log('✅ 定时监控已启动 (每5分钟检查一次)');
}

startMonitoring();
```

## 注意事项

1. **URL 格式**: 仅支持 HTTP/HTTPS 协议
2. **文件大小**: 单个文件最大 100GB
3. **并发限制**: 同时进行的离线任务数量有限
4. **轮询间隔**: 建议 5-10 秒查询一次进度
5. **失败重试**: 下载失败后可能自动重试（状态码 3）
6. **任务保留**: 完成的任务会保留在列表中
7. **批量操作**: 批量创建时注意错误处理

