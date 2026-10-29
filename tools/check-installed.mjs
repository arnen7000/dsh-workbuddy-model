#!/usr/bin/env node
// 安装态一致性检查：源码目录里的 lib/ 是否与 DSH profile 中已安装的副本一致。
//
// 为什么需要：`file:` 安装是**拷贝**，不是链接。改了源码不同步，DSH 里跑的还是旧代码，
// 而且不会报任何错——今天已经因此白排查过两次。
//
// 用法：
//   node tools/check-installed.mjs
//   DSH_HOME=/path/to/.dsh DSH_PROFILE=desktop node tools/check-installed.mjs
//
// 退出码：0 = 一致或未安装（未安装算 SKIP，不算失败）；1 = 不一致。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
const profile = process.env.DSH_PROFILE?.trim() || "desktop";
const profileDir = join(dshHome, "profiles", profile);
const installedDir = join(profileDir, "node_modules", pkg.name);

const hash = (path) => createHash("md5").update(readFileSync(path)).digest("hex");

if (!existsSync(installedDir)) {
  console.log(`SKIP  ${pkg.name} 未安装在 ${profileDir}`);
  process.exit(0);
}

const problems = [];
const notes = [];

const installedPkg = JSON.parse(readFileSync(join(installedDir, "package.json"), "utf8"));
if (installedPkg.name !== pkg.name) problems.push(`已安装副本的包名是 ${installedPkg.name}，期望 ${pkg.name}`);
if (installedPkg.version !== pkg.version) {
  problems.push(`版本不一致：源码 ${pkg.version} / 已安装 ${installedPkg.version}`);
}

// 逐文件比对 lib/
const sourceLib = join(root, "lib");
const installedLib = join(installedDir, "lib");
for (const file of readdirSync(sourceLib).sort()) {
  const from = join(sourceLib, file);
  const to = join(installedLib, file);
  if (!existsSync(to)) {
    problems.push(`已安装副本缺少 lib/${file}`);
    continue;
  }
  if (hash(from) !== hash(to)) problems.push(`lib/${file} 与源码不一致（改了没同步）`);
}

// 顶层清单文件
for (const file of ["cordis.patch.yml"]) {
  const to = join(installedDir, file);
  if (!existsSync(to)) {
    problems.push(`已安装副本缺少 ${file}`);
    continue;
  }
  if (hash(join(root, file)) !== hash(to)) problems.push(`${file} 与源码不一致`);
}

// package.json 只比宿主真正会读的字段：scripts 之类的差异不算问题
{
  const to = join(installedDir, "package.json");
  if (!existsSync(to)) problems.push("已安装副本缺少 package.json");
  else {
    const hostVisible = ["name", "version", "type", "main", "exports", "bin", "files", "dsh", "peerDependencies", "dependencies", "engines"];
    const source = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const installed = JSON.parse(readFileSync(to, "utf8"));
    for (const field of hostVisible) {
      if (JSON.stringify(source[field]) !== JSON.stringify(installed[field])) {
        problems.push(`package.json 的 ${field} 与源码不一致`);
      }
    }
  }
}

// 宿主是否认得这个 bundle
const profilePkgPath = join(profileDir, "package.json");
if (existsSync(profilePkgPath)) {
  const profilePkg = JSON.parse(readFileSync(profilePkgPath, "utf8"));
  const dep = profilePkg.dependencies?.[pkg.name];
  if (dep === undefined) problems.push(`profile 的 dependencies 里没有 ${pkg.name}`);
  const bundles = profilePkg.dsh?.profile?.bundles ?? [];
  if (!bundles.includes(pkg.name)) {
    problems.push(`profile 的 dsh.profile.bundles 里没有 ${pkg.name}（被宿主摘掉后插件不会加载）`);
  }
  if (typeof dep === "string" && dep.startsWith("file:")) {
    const target = resolve(dep.slice("file:".length));
    if (target !== root) notes.push(`profile 记录的是 ${target}，本次检查的源码目录是 ${root}`);
  }
} else {
  problems.push(`找不到 ${profilePkgPath}`);
}

if (problems.length === 0) {
  console.log(`PASS  ${pkg.name}@${pkg.version} 与 ${profileDir} 中的副本一致`);
  for (const note of notes) console.log(`      note: ${note}`);
  process.exit(0);
}

console.log(`FAIL  ${problems.length} 处不一致：`);
for (const problem of problems) console.log(`  - ${problem}`);
console.log("\n修复：把 lib/ 与清单文件重新拷到安装目录，然后重启 DSH。");
process.exit(1);
