import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { AppSettings, AppSettingsState } from '@123pan/shared-types'

const DEFAULTS: AppSettings = { downloadDir: null, askWhereToSave: true, downloadThreads: 4 }

const MIN_THREADS = 1
const MAX_THREADS = 8

function clampThreads(value: unknown): number {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return DEFAULTS.downloadThreads
  return Math.min(MAX_THREADS, Math.max(MIN_THREADS, num))
}

let settings: AppSettings = { ...DEFAULTS }

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): void {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8')) as Partial<AppSettings>
    settings = {
      downloadDir: typeof raw.downloadDir === 'string' ? raw.downloadDir : null,
      askWhereToSave: raw.askWhereToSave !== false,
      downloadThreads: clampThreads(raw.downloadThreads)
    }
  } catch {
    settings = { ...DEFAULTS }
  }
}

export function getSettings(): AppSettings {
  return { ...settings }
}

/** 供渲染层展示：附带只读的系统默认下载目录 */
export function getSettingsState(): AppSettingsState {
  return { ...settings, systemDownloadDir: app.getPath('downloads') }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...settings, ...patch }
  next.downloadThreads = clampThreads(next.downloadThreads)
  settings = next
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  return { ...settings }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettingsState())

  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    updateSettings(patch)
    return getSettingsState()
  })

  ipcMain.handle('settings:choose-download-dir', async () => {
    const choice = await dialog.showOpenDialog({
      title: '选择默认下载目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (choice.canceled || !choice.filePaths[0]) return null
    updateSettings({ downloadDir: choice.filePaths[0] })
    return choice.filePaths[0]
  })
}
