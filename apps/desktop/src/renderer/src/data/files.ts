import type { DriveItem } from '@123pan/shared-types'

export const mockDriveItems: DriveItem[] = [
  {
    id: 'f1',
    name: '产品设计资料',
    type: 'folder',
    parentId: null,
    size: 0,
    updatedAt: '2026-08-24T10:32:00+08:00'
  },
  {
    id: 'f1a',
    name: '产品需求文档-v2.docx',
    type: 'doc',
    parentId: 'f1',
    size: 1_863_424,
    updatedAt: '2026-08-26T14:20:00+08:00'
  },
  {
    id: 'f1b',
    name: '品牌设计稿.psd',
    type: 'image',
    parentId: 'f1',
    size: 268_435_456,
    updatedAt: '2026-08-25T11:47:00+08:00'
  },
  {
    id: 'f1c',
    name: '竞品分析.xlsx',
    type: 'doc',
    parentId: 'f1',
    size: 524_288,
    updatedAt: '2026-08-20T09:08:00+08:00'
  },
  {
    id: 'f2',
    name: '项目源码',
    type: 'folder',
    parentId: null,
    size: 0,
    updatedAt: '2026-08-21T18:05:00+08:00',
    starred: true
  },
  {
    id: 'f2a',
    name: '客户端源码.zip',
    type: 'archive',
    parentId: 'f2',
    size: 125_829_120,
    updatedAt: '2026-08-21T17:58:00+08:00'
  },
  {
    id: 'f2b',
    name: 'README.md',
    type: 'doc',
    parentId: 'f2',
    size: 18_432,
    updatedAt: '2026-08-19T12:00:00+08:00'
  },
  {
    id: 'f3',
    name: '旅行照片',
    type: 'folder',
    parentId: null,
    size: 0,
    updatedAt: '2026-08-15T09:12:00+08:00'
  },
  {
    id: 'f3a',
    name: '海边日落.jpg',
    type: 'image',
    parentId: 'f3',
    size: 8_388_608,
    updatedAt: '2026-08-15T09:00:00+08:00'
  },
  {
    id: 'f3b',
    name: '山顶合影.jpg',
    type: 'image',
    parentId: 'f3',
    size: 10_485_760,
    updatedAt: '2026-08-15T08:45:00+08:00'
  },
  {
    id: 'f3c',
    name: '旅行vlog.mp4',
    type: 'video',
    parentId: 'f3',
    size: 1_073_741_824,
    updatedAt: '2026-08-16T21:30:00+08:00'
  },
  {
    id: 'f4',
    name: '会议录音-0819.mp3',
    type: 'audio',
    parentId: null,
    size: 52_428_800,
    updatedAt: '2026-08-19T16:40:00+08:00'
  },
  {
    id: 'f5',
    name: '接口文档.pdf',
    type: 'doc',
    parentId: null,
    size: 4_194_304,
    updatedAt: '2026-08-18T08:55:00+08:00',
    starred: true
  },
  {
    id: 'f6',
    name: '背景音乐合集.zip',
    type: 'archive',
    parentId: null,
    size: 858_993_459,
    updatedAt: '2026-08-12T22:10:00+08:00'
  },
  {
    id: 'f7',
    name: '桌面壁纸-4K.jpg',
    type: 'image',
    parentId: null,
    size: 14_680_064,
    updatedAt: '2026-08-08T13:26:00+08:00'
  },
  {
    id: 'f8',
    name: '学习笔记.md',
    type: 'doc',
    parentId: null,
    size: 36_864,
    updatedAt: '2026-08-05T19:02:00+08:00'
  },
  {
    id: 'f9',
    name: '字体资源包.rar',
    type: 'archive',
    parentId: null,
    size: 341_835_776,
    updatedAt: '2026-07-30T15:18:00+08:00'
  }
]
