/**
 * rolldown-plugin-dts 在 dir 模式下会把声明拆成两个 chunk：
 * 空 facade（<name>.d.ts）与完整捆绑结果（<name>2.d.ts）。
 * 此脚本用完整结果归位到目标文件名，保证 dist 内只保留单一 d.ts。
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dirs = ["dist", "dist/modules"];

for (const dir of dirs) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    continue;
  }
  for (const entry of entries) {
    const match = entry.match(/^(.+)\d+\.d\.ts$/);
    if (!match) continue;
    const source = join(dir, entry);
    const target = join(dir, `${match[1]}.d.ts`);
    writeFileSync(target, readFileSync(source, "utf-8"));
    rmSync(source);
    console.log(`normalized ${source} -> ${target}`);
  }
}
