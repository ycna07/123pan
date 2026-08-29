import type { OutputOptions, RolldownOptions } from "rolldown";
import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const external = ["axios", "form-data"];

const modules = [
  { name: "core", input: "packages/core/src/index.ts" },
  { name: "file", input: "packages/file/src/index.ts" },
  { name: "offline", input: "packages/offline/src/index.ts" },
  { name: "user", input: "packages/user/src/index.ts" },
  { name: "direct-link", input: "packages/direct-link/src/index.ts" },
  { name: "image", input: "packages/image/src/index.ts" },
  { name: "video", input: "packages/video/src/index.ts" },
];

const rootDir = process.cwd();

// 内部包别名：主入口/集合包需要把 @123pan/* 捆绑进产物，
// 独立模块则通过外部化保留对 @123pan/core 的运行时依赖。
const innerAlias: Record<string, string> = Object.fromEntries(
  modules.map((module) => [
    `@123pan/${module.name}`,
    `${rootDir}/packages/${module.name}/src/index.ts`,
  ]),
);

const esOutput = (file: string): OutputOptions => ({
  file,
  format: "es",
  sourcemap: true,
  codeSplitting: false,
});
const cjsOutput = (file: string): OutputOptions => ({
  file,
  format: "cjs",
  sourcemap: true,
  codeSplitting: false,
});

const bundleEntry = (output: OutputOptions[]): RolldownOptions => ({
  input: "packages/sdk/src/index.ts",
  platform: "node",
  external,
  resolve: { alias: innerAlias },
  output,
});

const moduleEntry = (name: string): RolldownOptions[] => [
  {
    input: `packages/${name}/src/index.ts`,
    platform: "node",
    external: [...external, /^@123pan\//],
    output: [esOutput(`dist/modules/${name}.esm.js`), cjsOutput(`dist/modules/${name}.cjs`)],
  },
];

// dts 构建使用 dir 模式（插件会把声明拆成空 facade 与完整 bundle 两个 chunk，
// 由 scripts/normalize-dts.mjs 在构建后归位），emitDtsOnly 移除 JS chunk。
const bundleDtsEntry = (name: string): RolldownOptions => ({
  input: { [name]: "packages/sdk/src/index.ts" },
  platform: "node",
  external,
  resolve: { alias: innerAlias },
  plugins: [dts({ tsconfig: "./tsconfig.json", emitDtsOnly: true })],
  output: { dir: "dist", entryFileNames: "[name].d.ts", format: "es" },
});

const moduleDtsEntry = (name: string): RolldownOptions => ({
  input: { [name]: `packages/${name}/src/index.ts` },
  platform: "node",
  external: [...external, /^@123pan\//],
  plugins: [dts({ tsconfig: "./tsconfig.json", emitDtsOnly: true })],
  output: { dir: "dist/modules", entryFileNames: "[name].d.ts", format: "es" },
});

export default defineConfig([
  // 1. 主入口：默认导出集合包
  bundleEntry([esOutput("dist/index.esm.js"), cjsOutput("dist/index.cjs")]),

  // 2. 集合包：包含所有模块的完整 SDK（附 UMD 浏览器版本）
  bundleEntry([
    esOutput("dist/bundle.esm.js"),
    cjsOutput("dist/bundle.cjs"),
    {
      file: "dist/bundle.umd.js",
      format: "umd",
      name: "Pan123SDK",
      globals: { axios: "axios", "form-data": "formData" },
      sourcemap: true,
      codeSplitting: false,
    },
  ]),

  // 3. 独立模块：每个模块单独构建，@123pan/* 保持外部化
  ...modules.flatMap((module) => moduleEntry(module.name)),

  // 4. 类型定义：主入口与集合包内联全部类型
  bundleDtsEntry("index"),
  bundleDtsEntry("bundle"),

  // 5. 独立模块类型定义
  ...modules.map((module) => moduleDtsEntry(module.name)),
]);
