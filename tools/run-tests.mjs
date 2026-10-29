#!/usr/bin/env node
// 测试运行器：显式列出 test/*.test.mjs 再交给 node --test。
//
// 为什么不用 `node --test test/`：这个 Node 构建（22.22.2 / Windows）会把目录当成
// 模块去 require，直接 MODULE_NOT_FOUND。显式文件列表在所有平台上行为一致。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "test");

const files = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(testDir, name));

if (files.length === 0) {
  console.error("没有找到任何 test/*.test.mjs");
  process.exit(1);
}

console.log(`运行 ${files.length} 个测试文件：${files.map((f) => f.slice(testDir.length + 1)).join(", ")}\n`);

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: root });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
