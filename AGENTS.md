# AGENTS.md

Electron + Vue 3 + TypeScript desktop app (123pan client) built with electron-vite. pnpm-workspace monorepo: Electron app at `apps/desktop`, shared packages under `packages/` (the SDK's git history was merged in from a standalone repo via git filter-repo — `git log -- packages/` shows it).

## Session workflow (user constraints)

- 编码前确保 LSP 可用（先跑 `pnpm typecheck` 确认工具链正常再改代码）。
- 搜索代码优先使用 ast-grep（`sg`），而不是纯文本 grep。

## Verify changes

No test framework exists. Verify from the repo root with:

```
pnpm lint          # eslint --cache .
pnpm typecheck     # delegates to apps/desktop (typecheck:node = tsc, then typecheck:web = vue-tsc)
```

Run both before considering work done; `pnpm build` runs typecheck first, so a broken typecheck blocks builds.

## Architecture

Workspace members: `apps/*`, `packages/*`, `packages/123pan-api-sdk/packages/*` (SDK inner modules).

- `apps/desktop` — the electron-vite app (`@123pan/desktop`): `src/main` + `src/preload` → `tsconfig.node.json` (plain `tsc`); `src/renderer` → `tsconfig.web.json` (`vue-tsc`; `.vue` files are invisible to plain tsc). Renderer alias `@renderer/*` → `src/renderer/src/*`. electron-builder config + `build/` + `resources/` live here; build output is `apps/desktop/out/` (gitignored).
- `packages/123pan-api-sdk` — import as `@sharef/123pan-sdk` (`workspace:*` dep of the app); ESM via `dist/index.esm.js`, CJS via `dist/index.cjs`.
- `packages/ui-components` (`@123pan/ui`), `packages/shared-types` (`@123pan/shared-types`), `packages/core-logic` (`@123pan/core-logic`, skeleton) — shared packages export **source files** directly (`exports: "./src/index.ts"`, no build step); the app's vite/vue-tsc consume them as workspace links.

### Renderer UI stack (Nuxt UI v4)

- `@nuxt/ui` + Tailwind v4. The `ui()` plugin in `electron.vite.config.ts` **includes `@tailwindcss/vite`** — don't add it separately. `main.ts` must `app.use(ui)` from `@nuxt/ui/vue-plugin`; CSS entry is `@import 'tailwindcss'; @import '@nuxt/ui';`.
- `vue-router` is installed only because Nuxt UI's runtime Link overrides import it; the app itself has no routes yet.
- `U*` components and Nuxt UI composables are auto-imported by the plugin. Generated `components.d.ts` / `auto-imports.d.ts` land in `apps/desktop/src/renderer/` (covered by `tsconfig.web.json` via `src/renderer/*.d.ts`) and are committed — regenerate by running any vite dev/build.
- Icons come from installed `@iconify-json/*` collections and are client-bundled; add the collection package when using a new icon prefix. Fonts are disabled by the plugin in vite mode (no network fetch). Renderer CSP in `index.html` is `default-src 'self'` — works because icons are bundled; keep it that way.

### SDK package (`packages/123pan-api-sdk`)

- Keeps its own toolchain (rollup, jest, eslint 8); root eslint/prettier ignore this subtree — don't run root formatters over it.
- Inner `@123pan/*` modules are declared as `workspace:*` deps of the SDK root.
- `dist/` is gitignored but required at runtime: electron-vite externalizes main-process deps by default, so the packaged/dev app does a real `require('@sharef/123pan-sdk')`. Run `pnpm build:sdk` after a fresh clone or clean checkout.
- SDK package has `"type": "module"`; CJS rollup outputs must keep the `.cjs` extension and stay in sync with the `exports` map, otherwise `require()` silently returns an empty namespace (Node ≥ 22.12 require(esm)).

## Gotchas

- `apps/desktop/package.json` runs `postinstall: electron-builder install-app-deps` — needed for native deps; don't bypass.
- `.npmrc` (repo root) points Electron/electron-builder binaries at npmmirror mirrors; installs fail offline or if mirrors are unreachable.
- `pnpm-workspace.yaml` sets `shamefullyHoist: true` and `allowBuilds` for electron/esbuild/vue-demi — keep when touching install config.
- ESLint enforces `vue/block-lang`: every SFC `<script>` block must have `lang="ts"`.
- Prettier: no semicolons, single quotes, width 100, no trailing commas.
- Package under `apps/desktop/electron-builder.yml` uses hardcoded `123pan-` in `artifactName` (the package name is scoped, `${name}` would leak `@123pan/desktop` into filenames).
- Root `pnpm dev|build|start|build:win|mac|linux` are thin delegates to `pnpm -C apps/desktop …`; run electron-vite/electron-builder commands from `apps/desktop` (config paths are relative to it).
