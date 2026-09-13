# 123pan Desktop

A cross-platform desktop client for [123pan (123云盘)](https://www.123pan.com/), built with
Electron, Vue 3, TypeScript, Nuxt UI and Tailwind CSS.

## Features

### Authentication

- Sign in with account + password, by pasting a cookie / `Authorization` header / token, or with
  a QR code (the official login page is embedded and polled for the resulting JWT).
- The session token is encrypted at rest with Electron `safeStorage` (plaintext fallback when the
  OS keyring is unavailable); account, nickname and avatar are persisted and restored on launch.

### File management

- Folder browsing with breadcrumb navigation. Every opened folder is cached so switching back is
  instant, with a manual refresh.
- Search/filter within the current listing.
- Multi-select via checkboxes or rubber-band (marquee) selection, plus a right-click context menu.
- Sortable columns (name, size, modified time).
- Folder sizes are read from the API's recursive total and shown next to files.
- Drag-and-drop upload, and clipboard-style copy/cut then paste/move between folders.
- Delete to trash; restore or permanently delete from the trash view.
- Export a "reuse" (秒传) JSON manifest for files/folders, and import one to instant-transfer
  files whose hashes already exist in the cloud.
- Create offline-download tasks from a URL.

### Transfers

- Download manager with chunked, multi-threaded, resumable downloads; pause, resume, cancel,
  reveal in folder and remove tasks.
- Resumable uploads with per-file progress.
- Transfer settings: default download directory, "ask where to save", and download thread count.

### Sharing

- Create share links for the current selection with a selectable expiry and an optional or
  randomly generated password; the link is copied to the clipboard.
- Open (parse) a share link, browse its contents, and save selected items or everything to your
  drive, or download individual files directly.
- **My Shares** view: lists all shares with password, expiry (including expired/permanent),
  view/download/save counts and creation date; supports search, copy link, open in the parser,
  and cancelling one or many shares.

### Appearance & UX

- Light, dark and follow-system themes (persisted), selectable from an appearance submenu in the
  account menu or via a quick header toggle.
- Resizable sidebar whose width is persisted.

## Architecture

- **Main process** (`apps/desktop/src/main`) owns the 123pan API SDK and performs authentication,
  drive operations, downloads/uploads and settings persistence; it exposes typed IPC handlers.
- **Preload** (`apps/desktop/src/preload`) exposes a typed `window.api` bridge to the renderer.
- **Renderer** (`apps/desktop/src/renderer`) is a Vue 3 SFC application using Nuxt UI v4 and
  Tailwind v4, with a CSP that allows only bundled assets (icons are bundled, no network fetch).
- The repo is a pnpm monorepo: `apps/desktop` is the app, `packages/*` provides shared types and
  UI, and `packages/123pan-api-sdk` is the API SDK.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
pnpm install
```

### Build the SDK

The app loads the API SDK at runtime, so build it once after cloning or cleaning:

```bash
pnpm build:sdk
```

### Development

```bash
pnpm dev
```

### Verify

```bash
pnpm lint
pnpm typecheck
```

### Build

```bash
# For Windows
pnpm build:win

# For macOS
pnpm build:mac

# For Linux
pnpm build:linux
```
