import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { AppSettings } from '@123pan/shared-types'

const DEFAULTS: AppSettings = { downloadDir: null, askWhereToSave: true }

let settings: AppSettings = { ...DEFAULTS }

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): void {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8')) as Partial<AppSettings>
    settings = {
      downloadDir: typeof raw.downloadDir === 'string' ? raw.downloadDir : null,
      askWhereToSave: raw.askWhereToSave !== false
    }
  } catch {
    settings = { ...DEFAULTS }
  }
}

export function getSettings(): AppSettings {
  return { ...settings }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...patch }
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  return { ...settings }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => updateSettings(patch))

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
