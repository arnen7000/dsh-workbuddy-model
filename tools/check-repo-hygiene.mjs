#!/usr/bin/env node
// 仓库卫生自检：确保**将要上传**的东西里没有本机信息与凭据。
//
// 为什么需要：这个仓库会公开。本机路径（用户名、盘符、安装目录）不会让插件坏掉，
// 但会把开发者的机器信息永久写进公开历史——而且 git 历史里删不干净。
// 所以要在推送**之前**拦住，而不是推送之后补救。
//
// 只扫 `git ls-files`（即真正会被提交的文件）；未跟踪的草稿不算。
//
// 用法：
//   node tools/check-repo-hygiene.mjs
//
// 退出码：0 = 干净；1 = 发现问题。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 本文件自身含这些模式的定义，扫自己没有意义
const SELF = "tools/check-repo-hygiene.mjs";

const RULES = [
  {
    id: "H1",
    label: "Windows 用户目录（会暴露用户名）",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/gu,
  },
  {
    id: "H2",
    label: "macOS / Linux 用户目录",
    pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+\//gu,
  },
  {
    id: "H3",
    label: "盘符绝对路径（换机器即失效）",
    // 前置断言排除 URL 的 scheme（`https://host/path` 里的 `s:` 不是盘符）
    pattern: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]{1,2}[A-Za-z0-9._-]+[\\/][A-Za-z0-9._-]+/gu,
  },
  {
    id: "H4",
    label: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/gu,
  },
  {
    id: "H5",
    label: "npm token",
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/gu,
  },
  {
    id: "H6",
    label: "云厂商 / 通用密钥",
    pattern: /\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{32,}\b/gu,
  },
  {
    id: "H7",
    label: "私钥文件内容",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
  },
];

// 允许出现的绝对路径写法：这些是「格式」而不是「某台机器」
const ALLOW = [
  /^[A-Za-z]:[\\/]+Users[\\/]+alice[\\/]/u, // 平台测试里的占位用户名
  /^[A-Za-z]:[\\/]+Users[\\/]+<[^>]*>/u,
];

const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|tgz|gz|node|exe|dll|woff2?)$/iu;

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
    return out.toString("utf8").split("\0").filter(Boolean);
  } catch {
    console.log("SKIP  不是 git 仓库或没有 git，跳过");
    process.exit(0);
  }
}

const problems = [];
let scanned = 0;

for (const rel of trackedFiles()) {
  if (rel === SELF) continue;
  if (BINARY_EXT.test(rel)) continue;

  let text;
  try {
    const buffer = readFileSync(join(root, rel));
    if (buffer.includes(0)) continue; // 二进制
    text = buffer.toString("utf8");
  } catch {
    continue;
  }
  scanned += 1;

  const lines = text.split("\n");
  for (const rule of RULES) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(line);
      if (match === null) continue;
      if (ALLOW.some((allow) => allow.test(match[0]))) continue;
      problems.push({ rule, file: rel, line: index + 1, hit: match[0].slice(0, 80) });
    }
  }
}

console.log(`扫描 ${scanned} 个已跟踪文本文件`);

if (problems.length === 0) {
  console.log("PASS  未发现本机信息或凭据");
  process.exit(0);
}

for (const problem of problems) {
  console.log(`FAIL  ${problem.rule.id} ${problem.rule.label}`);
  console.log(`      ${problem.file}:${problem.line}  →  ${problem.hit}`);
}
console.log(`\n共 ${problems.length} 处。改成本机无关的写法再提交。`);
process.exit(1);
