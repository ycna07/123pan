import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  AuthStatus,
  DriveItem,
  DownloadProgress,
  DownloadTask,
  LoginCredentials,
  QrLoginState,
  ReuseExportResult,
  StorageUsage,
  UploadProgress,
  UploadTask
} from '@123pan/shared-types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      login(credentials: LoginCredentials): Promise<AuthStatus>
      loginWithCookie(raw: string): Promise<AuthStatus>
      qrStart(): Promise<{ qrUrl: string }>
      qrStop(): Promise<void>
      getAuthStatus(): Promise<AuthStatus>
      logout(): Promise<void>
      listFiles(folderId: string | null): Promise<DriveItem[]>
      deleteFiles(fileIds: string[]): Promise<string[]>
      listTrashFiles(): Promise<DriveItem[]>
      restoreFiles(fileIds: string[]): Promise<string[]>
      deleteFilesForever(fileIds: string[]): Promise<string[]>
      moveFiles(fileIds: string[], targetFolderId: string | null): Promise<string[]>
      copyFiles(fileIds: string[], targetFolderId: string | null): Promise<string[]>
      getUsage(): Promise<StorageUsage>
      createShare(
        fileIds: string[],
        name: string,
        expire: 0 | 1 | 7 | 30,
        pwd?: string
      ): Promise<{ url: string; shareKey: string; sharePwd?: string }>
      copyText(text: string): Promise<boolean>
      parseShare(
        link: string,
        parentFolderId?: string | null
      ): Promise<{
        shareKey: string
        sharePwd?: string
        items: DriveItem[]
      }>
      transferShare(
        link: string,
        targetFolderId: string | null,
        parentFolderId?: string | null,
        fileIds?: string[]
      ): Promise<{ count: number }>
      downloadShared(link: string, fileId: string, name: string): Promise<unknown>
      getDownloadLink(fileId: string): Promise<{ url: string }>
      downloadFile(fileId: string, name: string, savePath?: string): Promise<unknown>
      copyDownloadLink(fileId: string): Promise<string>
      onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void
      getSettings(): Promise<AppSettings>
      updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
      chooseDownloadDir(): Promise<string | null>
      downloadsList(): Promise<DownloadTask[]>
      cancelDownload(id: string): Promise<boolean>
      resumeDownload(id: string): Promise<unknown>
      revealDownload(id: string): Promise<boolean>
      removeDownload(id: string): Promise<boolean>
      removeUpload(id: string): Promise<boolean>
      onDownloadUpdated(callback: (task: DownloadTask) => void): () => void
      uploadFile(filePath: string, parentFolderId: string | null): Promise<unknown>
      createFolder(parentFolderId: string | null, name: string): Promise<unknown>
      createOfflineTask(url: string, parentFolderId: string | null): Promise<unknown>
      getPathForFile(file: File): string
      onUploadProgress(callback: (progress: UploadProgress) => void): () => void
      uploadsList(): Promise<UploadTask[]>
      cancelUpload(id: string): Promise<boolean>
      resumeUpload(id: string): Promise<unknown>
      onUploadUpdated(callback: (task: UploadTask) => void): () => void
      reuseSave(parentFolderId: string | null, jsonText: string): Promise<unknown>
      exportReuse(fileIds: string[]): Promise<ReuseExportResult>
      onReuseProgress(
        callback: (progress: { done: number; total: number; current: string; ok: boolean }) => void
      ): () => void
      onLoginSuccess(callback: (status: AuthStatus) => void): () => void
      onQrStatus(callback: (state: QrLoginState) => void): () => void
    }
  }
}
