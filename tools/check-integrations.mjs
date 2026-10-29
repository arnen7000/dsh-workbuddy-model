#!/usr/bin/env node
// 外部集成自检：侧栏「积分」那两行是否还指着本插件现在的路由。
//
// 为什么需要：侧栏积分不是插件自己渲染的，而是 dsh-cost-meter 的**自定义余额**——
// 它只做「GET 一个 URL + 按点路径取值」。插件改包名 / 改路由前缀之后，插件本身完全正常，
// 但这两行会静默变成「查询失败」。这类断裂没有任何报错，只能靠比对配置发现。
//
// 用法：
//   node tools/check-integrations.mjs
//   DSH_HOME=/path/to/.dsh node tools/check-integrations.mjs
//
// 退出码：0 = 一致 / 没装 cost-meter（SKIP）；1 = 有指向旧路由的条目。
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
const ledgerPath = join(dshHome, "storages", "cost-meter", "ledger.json");

if (!existsSync(ledgerPath)) {
  console.log(`SKIP  没有 dsh-cost-meter 配置（${ledgerPath}）`);
  process.exit(0);
}

let ledger;
try {
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
} catch (error) {
  console.log(`FAIL  ${ledgerPath} 不是合法 JSON：${String(error.message).slice(0, 120)}`);
  process.exit(1);
}

const balances = Array.isArray(ledger?.config?.customBalances) ? ledger.config.customBalances : [];
const pointing = balances.filter((entry) => typeof entry?.request?.url === "string" && entry.request.url.includes("/plugins/"));

if (pointing.length === 0) {
  console.log("SKIP  自定义余额里没有指向 /plugins/ 的条目");
  process.exit(0);
}

let bad = 0;
for (const entry of pointing) {
  const label = entry.label ?? entry.labelEn ?? "(未命名)";
  const url = entry.request.url;
  const expected = `/plugins/${pkg.name}/`;
  if (url.includes(expected)) {
    console.log(`PASS  ${label} → ${url}`);
    continue;
  }
  bad += 1;
  console.log(`FAIL  ${label} 指向 ${url}`);
  console.log(`      应包含 ${expected}（插件已改名或改路由，面板会显示「查询失败」而插件本身正常）`);
}

if (bad > 0) {
  console.log(`\n${bad} 条自定义余额指向旧路由 —— 改 ledger.json 的 request.url 即可，不必重启 App。`);
  process.exit(1);
}
console.log("\n全部指向当前路由");
