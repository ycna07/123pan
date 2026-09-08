/**
 * 离线下载模块（普通用户 API）
 */

import { HttpClient } from '@123pan/core'
import type { ApiResponse, PaginatedResponse, OfflineTask, PaginationParams } from '@123pan/core'

interface NormalOfflineTask {
  task_id?: number | string
  name?: string
  status?: number
  size?: number
  downloaded?: number
  progress?: number
  speed?: number
  type?: number
  create_time?: number | string
  finish_time?: number | string
  error_message?: string
}

interface NormalOfflineListResponse {
  has_run?: boolean
  list?: NormalOfflineTask[]
  total?: number
}

interface NormalOfflineResolveItem {
  id?: number | string
  files?: Array<{ id?: number | string }>
}

interface NormalOfflineResolveResponse {
  list?: NormalOfflineResolveItem[]
}

interface NormalOfflineTaskListParams extends PaginationParams {
  status?: number[]
}

const OFFLINE_STATUS_MAP: Record<number, OfflineTask['taskStatus']> = {
  0: 'downloading',
  1: 'failed',
  2: 'completed',
  3: 'retrying',
  4: 'pending'
}

/** 创建离线任务参数 */
export interface CreateOfflineTaskParams {
  /** 下载URL */
  url: string
  /** 父目录ID（选填） */
  parentId?: string | number
}

/** 批量创建离线任务参数 */
export interface BatchCreateOfflineTaskParams {
  /** 下载URL列表，支持多个URL */
  urls: string[]
  /** 父目录ID（选填），上传到根目录时填写 0 */
  parentId?: string | number
}

/** 获取离线下载进度响应 */
export interface GetOfflineDownloadProcessResponse {
  /** 下载进度百分比，当文件下载失败时，该进度将会归零 */
  process: number
  /** 下载状态：0-进行中，1-下载失败，2-下载成功，3-重试中 */
  status: 0 | 1 | 2 | 3
}

export class OfflineModule {
  constructor(private httpClient: HttpClient) {}

  /**
   * 创建离线下载任务
   * @param params 创建任务参数
   * @param params.url 下载URL
   * @param params.parentId 父目录ID（选填）
   * @returns 离线任务
   */
  async createTask(params: CreateOfflineTaskParams): Promise<ApiResponse<OfflineTask>> {
    const resolve = await this.httpClient.post<NormalOfflineResolveResponse>(
      '/api/v2/offline_download/task/resolve',
      { urls: params.url }
    )
    const resource = resolve.data.list?.[0]

    if (!resource) {
      throw new Error('离线任务解析失败：没有可用资源')
    }

    await this.httpClient.post('/api/v2/offline_download/task/submit', {
      resource_list: [
        {
          resource_id: resource.id,
          select_file_id: (resource.files || []).map((file) => file.id)
        }
      ],
      ...(params.parentId !== undefined ? { upload_dir: Number(params.parentId) } : {})
    })

    return {
      code: resolve.code,
      message: resolve.message,
      data: {
        taskId: String(resource.id || ''),
        taskName: '',
        taskUrl: params.url,
        taskStatus: 'pending',
        progress: 0,
        createTime: ''
      }
    }
  }

  /**
   * 批量创建离线下载任务
   * 通过循环调用单个创建任务方法来实现批量创建
   * @param params 批量创建任务参数
   * @param params.urls 下载URL列表，支持多个URL
   * @param params.parentId 父目录ID（选填），上传到根目录时填写 0
   * @returns 所有创建的离线任务列表
   */
  async batchCreateTasks(
    params: BatchCreateOfflineTaskParams
  ): Promise<ApiResponse<OfflineTask[]>> {
    const { urls, parentId } = params
    const allTasks: OfflineTask[] = []
    const errors: Array<{ url: string; error: string }> = []

    // 循环调用单个创建任务方法
    for (const url of urls) {
      try {
        const taskParams: CreateOfflineTaskParams = { url }
        if (parentId !== undefined) {
          taskParams.parentId = parentId
        }

        const result = await this.createTask(taskParams)

        if (result.code === 0 && result.data) {
          allTasks.push(result.data)
        } else {
          errors.push({
            url,
            error: result.message || '创建任务失败'
          })
        }
      } catch (err) {
        errors.push({
          url,
          error: err instanceof Error ? err.message : '未知错误'
        })
      }
    }

    // 如果有错误，返回部分成功的结果
    if (errors.length > 0) {
      return {
        code: 1,
        message: `部分任务创建失败，成功: ${allTasks.length}, 失败: ${errors.length}`,
        data: allTasks
      }
    }

    // 所有任务都成功
    return {
      code: 0,
      message: 'ok',
      data: allTasks
    }
  }

  /**
   * 获取离线下载进度
   * @param params 查询参数
   * @param params.taskID 离线下载任务ID
   * @returns 下载进度和状态
   */
  async getDownloadProcess(params: {
    /** 离线下载任务ID */
    taskID: number | string
  }): Promise<ApiResponse<GetOfflineDownloadProcessResponse>> {
    const result = await this.getTaskInfo(String(params.taskID))
    return {
      code: result.code,
      message: result.message,
      data: {
        process: result.data.progress,
        status: normalizeProcessStatus(result.data.taskStatus)
      }
    }
  }

  /**
   * 获取离线任务列表
   */
  async getTaskList(
    params: NormalOfflineTaskListParams = {}
  ): Promise<ApiResponse<PaginatedResponse<OfflineTask>>> {
    const page = params.page || 1
    const limit = Math.min(params.limit || 100, 100)
    const result = await this.httpClient.post<NormalOfflineListResponse>(
      '/api/offline_download/task/list',
      {
        current_page: page,
        page_size: limit,
        status_arr: params.status || [0, 1, 2, 3, 4]
      }
    )
    const tasks = (result.data.list || []).map(mapNormalTask)

    return {
      ...result,
      data: {
        list: tasks,
        total: toNumber(result.data.total ?? tasks.length),
        page,
        limit
      }
    }
  }

  /**
   * 获取任务详情
   */
  async getTaskInfo(taskId: string): Promise<ApiResponse<OfflineTask>> {
    const taskID = toNumber(taskId)
    const result = await this.getTaskList({ page: 1, limit: 100 })
    const task = result.data.list.find((item) => Number(item.taskId) === taskID)

    if (!task) {
      throw new Error(`未找到离线任务：${taskId}`)
    }

    return {
      code: result.code,
      message: result.message,
      data: task
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<ApiResponse<void>> {
    await this.httpClient.post('/api/offline_download/task/delete', {
      task_ids: [toNumber(taskId)],
      status_arr: []
    })
    return { code: 0, message: 'ok', data: undefined }
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<ApiResponse<void>> {
    await this.abortTask(taskId, true)
    return { code: 0, message: 'ok', data: undefined }
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<ApiResponse<void>> {
    await this.abortTask(taskId, false)
    return { code: 0, message: 'ok', data: undefined }
  }

  private async abortTask(taskId: string, isAbort: boolean): Promise<void> {
    await this.httpClient.post('/api/offline_download/task/abort', {
      task_ids: [toNumber(taskId)],
      is_abort: isAbort,
      all: false
    })
  }
}

function mapNormalTask(raw: NormalOfflineTask): OfflineTask {
  const status = toNumber(raw.status)
  return {
    taskId: String(raw.task_id ?? ''),
    taskName: raw.name || '',
    taskUrl: '',
    taskStatus: OFFLINE_STATUS_MAP[status] || 'pending',
    progress: toNumber(raw.progress),
    ...(raw.size !== undefined && { fileSize: raw.size }),
    ...(raw.speed !== undefined && { downloadSpeed: raw.speed }),
    createTime: String(raw.create_time ?? ''),
    ...(raw.finish_time !== undefined && { completeTime: String(raw.finish_time) }),
    ...(raw.error_message !== undefined && { errorMessage: raw.error_message })
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeProcessStatus(status: OfflineTask['taskStatus']): 0 | 1 | 2 | 3 {
  switch (status) {
    case 'downloading':
    case 'paused':
      return 0
    case 'failed':
      return 1
    case 'completed':
      return 2
    default:
      return 0
  }
}
