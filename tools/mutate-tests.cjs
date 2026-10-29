// 变异测试：故意改坏代码，确认测试会失败。恒真的断言在这里会暴露。
// 在临时副本里做，不碰真实目录。
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

// 仓库根由本文件位置推出，不写死绝对路径（否则换机器就废，也会把本机路径带进仓库）
const SRC = path.resolve(__dirname, "..");
const NODE = process.execPath;

// suite: 该变异应由哪一层抓到。两层都要被证明有效，否则等于只有一半护栏。
const MUTATIONS = [
  {
    name: "去掉国内 system 折叠",
    suite: "run-tests",
    file: "lib/host-heartbeat-SJaZ33tR.js",
    from: "\tdropUnsupportedEffort(body);\n\tfoldSystemIntoFirstUser(body);\n\treturn JSON.stringify(body);\n}\n/**\n* Move every",
    to: "\tdropUnsupportedEffort(body);\n\treturn JSON.stringify(body);\n}\n/**\n* Move every",
  },
  {
    name: "只改客户端一半的路由字面量",
    suite: "run-tests",
    file: "lib/client.js",
    from: '"/plugins/dsh-workbuddy-model/status"',
    to: '"/plugins/dsh-workbuddy-model/stats"',
  },
  {
    // 加回内核 peer = 给安装加一道版本闸门，某些内核会被直接拒装。
    name: "给 DSH 内核加回 peer 区间",
    suite: "run-tests",
    file: "package.json",
    from: '"@deepseek-ai/cordis": "^4.0.5",\n    "@deepseek-ai/schemastery"',
    to: '"@deepseek-ai/cordis": "^4.0.5",\n    "@deepseek-ai/dsh-llm": ">=0.2.1-rc.1",\n    "@deepseek-ai/schemastery"',
  },
  {
    name: "国际版不再补 system",
    suite: "run-tests",
    file: "lib/host-heartbeat-SJaZ33tR.js",
    from: '\tmessages.unshift({\n\t\trole: "system",\n\t\tcontent: INTERNATIONAL_SYSTEM_PROMPT\n\t});',
    to: "\tvoid messages;",
  },
  {
    name: "402 不再归因为额度用尽",
    suite: "scenarios",
    file: "lib/host-heartbeat-SJaZ33tR.js",
    from: '\tif (status === 402) return "hard_credit";',
    to: '\tif (status === 402) return "client";',
  },
  {
    name: "余额不再夹到 0（会显示负积分）",
    suite: "scenarios",
    file: "lib/host-heartbeat-SJaZ33tR.js",
    from: "\t\t\tif (remain < 0) remain = 0;\n\t\t\ttotal += remain;",
    to: "\t\t\ttotal += remain;",
  },
  {
    name: "拆掉 status 路由的回环守卫",
    suite: "scenarios",
    file: "lib/index.js",
    from: "\t\tif (!loopbackRequest(req)) {",
    to: "\t\tif (false) {",
  },
  {
    // 入口指到 lib/ 之外 = 宿主会去加载一份不存在的实现。
    name: "主入口指到 lib/ 之外",
    suite: "run-tests",
    file: "package.json",
    from: '"main": "lib/index.js"',
    to: '"main": "dist/index.js"',
  },
  {
    // 漏发第三方声明 = 发到 npm 构成许可证缺失。
    name: "发布清单漏掉第三方许可证声明",
    suite: "run-tests",
    file: "package.json",
    from: '    "LICENSE",\n    "THIRD_PARTY_NOTICES.txt"',
    to: '    "LICENSE"',
  },
];

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (["node_modules", ".git", ".local", "src", "temp"].includes(entry.name)) continue;
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

const COMMAND = {
  "run-tests": "tools/run-tests.mjs",
  scenarios: "tools/scenarios.mjs",
};

// ⚠️ 临时副本必须能解析到依赖（host bundle 会 import @deepseek-ai/dsh-home-paths 等）。
// 早期版本把 node_modules 排除在拷贝之外，结果**每个变异都因「模块找不到」而"被捕获"**——
// 看起来 4/4 全杀，实际上一条都没验证到。这类假阳性比没有测试更危险。
// 现在：临时目录放在仓库同盘（junction 不能跨卷），用目录联接指向真实 node_modules。
const PARENT = path.dirname(SRC);
const REAL_MODULES = path.join(SRC, "node_modules");

function linkDependencies(dir) {
  if (!fs.existsSync(REAL_MODULES)) {
    throw new Error(`找不到 ${REAL_MODULES}：先跑 pnpm install，否则变异测试会全部假阳性`);
  }
  fs.symlinkSync(REAL_MODULES, path.join(dir, "node_modules"), "junction");
}

/**
 * 清理临时目录。**必须先拆掉 node_modules 联接**：
 * 它是指向真实依赖的 reparse point，直接递归删除在 Windows 上有跟进删除的风险，
 * 那就等于把仓库的 node_modules 一起删了。
 */
function cleanup(dir) {
  const link = path.join(dir, "node_modules");
  try {
    if (fs.lstatSync(link).isSymbolicLink() || fs.lstatSync(link).isDirectory()) fs.rmdirSync(link);
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}

let survived = 0;
for (const mutation of MUTATIONS) {
  const dir = fs.mkdtempSync(path.join(PARENT, ".mut-"));
  copyTree(SRC, dir);
  linkDependencies(dir);

  const target = path.join(dir, mutation.file);
  // 工作副本是 CRLF，锚点写成 LF：在临时副本里先归一化行尾，锚点才能匹配
  const before = fs.readFileSync(target, "utf8").replace(/\r\n/gu, "\n");
  if (!before.includes(mutation.from)) {
    console.log(`SKIP      ${mutation.name} —— 锚点文本没找到，变异未生效（这条本身要修）`);
    survived += 1;
    cleanup(dir);
    continue;
  }
  fs.writeFileSync(target, before.replace(mutation.from, mutation.to));

  const run = spawnSync(NODE, [COMMAND[mutation.suite]], { cwd: dir, encoding: "utf8" });
  const output = `${run.stdout}${run.stderr}`;
  const failed = mutation.suite === "run-tests"
    ? Number(/# fail (\d+)/u.exec(output)?.[1] ?? -1)
    : Number(/FAIL (\d+)/u.exec(output)?.[1] ?? -1);
  const killed = run.status !== 0 && failed > 0;

  console.log(`${killed ? "KILLED  " : "SURVIVED"}  ${mutation.name} —— 失败用例 ${failed} 个（${mutation.suite}）`);
  if (!killed) survived += 1;
  cleanup(dir);
}

console.log(survived === 0 ? "\nALL MUTATIONS KILLED" : `\n${survived} 个变异存活 —— 测试有恒真嫌疑`);
process.exit(survived === 0 ? 0 : 1);
