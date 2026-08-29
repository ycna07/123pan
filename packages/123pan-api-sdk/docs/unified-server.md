# 统一演示服务器使用说明

## 🎯 概述

统一演示服务器将原来的两个服务器（API测试服务器和演示页面服务器）合并为一个，简化了开发和测试流程。

## 🚀 启动服务器

```bash
# 方式1: 使用yarn（推荐）
yarn demo

# 方式2: 使用npm
npm run demo

# 方式3: 直接运行
node packages/demo/src/unified-server.mjs
```

## 📍 访问地址

服务器启动后，可以通过以下地址访问：

- **演示页面**: http://localhost:3000
- **API服务**: http://localhost:3000/api
- **静态资源**: 
  - http://localhost:3000/dist (构建输出)
  - http://localhost:3000/packages (源码包)

## 🔧 功能特性

### 1. 统一端口
- 所有服务都在端口3000上运行
- 无需管理多个端口
- 简化了CORS配置

### 2. 完整API支持
包含所有原test-server的API端点：

#### 认证相关
- `POST /api/v1/access_token` - 获取访问令牌

#### 用户管理
- `GET /api/v1/user/info` - 获取用户信息
- `GET /api/v1/user/storage` - 获取存储空间信息

#### 文件管理
- `GET /api/v1/file/list` - 获取文件列表
- `GET /api/v1/file/info/:fileId` - 获取文件详情
- `POST /api/v1/file/mkdir` - 创建文件夹
- `DELETE /api/v1/file/:fileId` - 删除文件

#### 分享管理
- `POST /api/v1/share/create` - 创建分享
- `GET /api/v1/share/list` - 获取分享列表
- `GET /api/v1/share/:shareId` - 获取分享详情
- `DELETE /api/v1/share/:shareId` - 删除分享

#### 离线下载
- `POST /api/v1/offline/create` - 创建下载任务
- `GET /api/v1/offline/list` - 获取任务列表
- `POST /api/v1/offline/pause/:taskId` - 暂停任务
- `DELETE /api/v1/offline/:taskId` - 删除任务

#### 直链管理
- `POST /api/v1/direct-link/create` - 创建直链
- `GET /api/v1/direct-link/list` - 获取直链列表

#### 图床管理
- `GET /api/v1/image/list` - 获取图片列表

#### 视频转码
- `POST /api/v1/video/transcode` - 创建转码任务
- `GET /api/v1/video/tasks` - 获取转码任务列表

### 3. 演示页面功能
- 完整的SDK测试界面
- 实时日志显示
- 性能监控
- 配置管理
- 开发工具面板

### 4. 开发友好
- 支持Source Maps调试
- 自动重载功能
- 详细的请求/响应日志
- 错误处理和统计

## 🛠️ 开发工作流

### 1. 启动开发环境
```bash
# 启动服务器
yarn demo

# 在浏览器中打开
open http://localhost:3000
```

### 2. 修改SDK源码
```bash
# 修改源码后重新构建
yarn build

# 如果开启了自动重载，演示页面会自动更新
```

### 3. 测试API
```bash
# 可以直接使用curl测试API
curl -X POST http://localhost:3000/api/v1/access_token \
  -H "Content-Type: application/json" \
```

## 📊 优势对比

### 之前（两个服务器）
- 需要启动两个服务器（端口3000和8080）
- 需要配置CORS
- 管理复杂
- 端口冲突风险

### 现在（统一服务器）
- 只需启动一个服务器（端口3000）
- 自动处理CORS
- 管理简单
- 减少资源占用

## 🔍 故障排除

### 端口占用
如果端口3000被占用：
```bash
# 查找占用进程
lsof -i :3000

# 终止进程
kill -9 <PID>
```

### 服务器无法启动
检查以下几点：
1. Node.js版本是否 >= 16
2. 依赖是否已安装 (`yarn install`)
3. 端口3000是否可用
4. 文件权限是否正确

### API调用失败
1. 确认服务器正在运行
2. 检查API端点是否正确
3. 验证请求格式和参数
4. 查看服务器控制台日志

## 📝 配置说明

### 测试凭证
- **Client ID**: `test-client-id`
- **Client Secret**: `test-client-secret`

### 默认配置
- **端口**: 3000
- **API前缀**: `/api/v1`
- **令牌有效期**: 1小时
- **CORS**: 允许所有来源

### 自定义配置
可以通过修改 `packages/demo/src/unified-server.mjs` 来自定义：
- 端口号
- API路径
- 模拟数据
- 中间件配置

## 🚀 部署建议

### 开发环境
直接使用 `yarn demo` 启动即可

### 生产环境
```bash
# 使用PM2管理进程
npm install -g pm2
pm2 start packages/demo/src/unified-server.mjs --name "123pan-demo"

# 或使用Docker
# 创建Dockerfile并构建镜像
```

这个统一服务器大大简化了开发和测试流程，提供了更好的开发体验！
