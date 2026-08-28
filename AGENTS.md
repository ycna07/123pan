# AGENTS.md

Electron + Vue 3 + TypeScript desktop app (123pan client) built with electron-vite. Package manager is **pnpm** (lockfile + `pnpm-workspace.yaml`; not a real monorepo).

## Session workflow (user constraints)

- 编码前确保 LSP 可用（先跑 `pnpm typecheck` 确认工具链正常再改代码）。
- 搜索代码优先使用 ast-grep（`sg`），而不是纯文本 grep。

## Verify changes

No test framework exists. Verify with:

```
pnpm lint          # eslint --cache
pnpm typecheck     # runs typecheck:node (tsc) then typecheck:web (vue-tsc)
```

Run both before considering work done; `pnpm build` runs typecheck first, so a broken typecheck blocks builds.

## Architecture

Three-process electron-vite layout, split across two tsconfig projects:

- `src/main` + `src/preload` → `tsconfig.node.json` (plain `tsc`)
- `src/renderer` → `tsconfig.web.json` (`vue-tsc`; `.vue` files are invisible to plain tsc)

Renderer alias: `@renderer/*` → `src/renderer/src/*` (vite alias + tsconfig paths).

## Gotchas

- `postinstall` runs `electron-builder install-app-deps` — needed for native deps; don't bypass.
- `.npmrc` points Electron/electron-builder binaries at npmmirror mirrors; installs fail offline or if mirrors are unreachable.
- `pnpm-workspace.yaml` sets `shamefullyHoist: true` and `allowBuilds` for electron/esbuild — keep when touching install config.
- ESLint enforces `vue/block-lang`: every SFC `<script>` block must have `lang="ts"`.
- Prettier: no semicolons, single quotes, width 100, no trailing commas.
- Build output goes to `out/` (gitignored); packages via `pnpm build:win|mac|linux` (electron-builder, config in `electron-builder.yml`).
