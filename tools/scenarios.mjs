#!/usr/bin/env node
/**
 * 用户场景套件（scenarios.mjs）
 * ---------------------------------------------------------------------------
 * 与 `tools/run-tests.mjs` 的分工：
 *   - run-tests.mjs —— 测「契约」：请求体形状、身份规则、平台路径、清单一致性。
 *                      要求的是「东西必须长成什么样」。
 *   - 本文件       —— 测「用户真实会撞上的异常路径」：上游报错、凭据坏掉、
 *                      目录畸形、路由被绕过、体系被拆掉。
 *
 * 每个场景都问两件事：**错误能不能归因**（用户/维护者能否按 code 定位）
 * 与 **是否优雅降级**（不把宿主搞崩、不静默吞错、不误报成功）。
 *
 * 全部离线：不需要凭据、不需要网络，靠构造输入与打桩 `fetch`。
 *
 * 用法：
 *   node tools/scenarios.mjs            # 测当前仓库（源码态）
 *   node tools/scenarios.mjs <插件目录>  # 测已安装副本
 */

import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const targetDir = resolve(process.argv[2] ?? root);

// 隔离数据目录：本套件绝不读写用户真实的 ~/.dsh
const sandboxHome = mkdtempSync(join(tmpdir(), "wbm-scenarios-"));
process.env.DSH_HOME = sandboxHome;

let pass = 0;
let fail = 0;
const skipped = [];
const failures = [];

function check(id, label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${id}  ${label}`);
    pass += 1;
  } else {
    console.log(`  FAIL  ${id}  ${label}${detail === "" ? "" : `  → ${detail}`}`);
    fail += 1;
    failures.push(`${id} ${label}${detail === "" ? "" : ` (${detail})`}`);
  }
}

/**
 * 明确跳过：既不算 PASS 也不算 FAIL。
 * 环境限制（起不了子进程、缺某个外部程序）不能伪装成通过，也不该报成插件缺陷。
 */
function skip(id, label, reason) {
  console.log(`  SKIP  ${id}  ${label}（${reason}）`);
  skipped.push(`${id} ${label}（${reason}）`);
}

function section(title) {
  console.log(`\n${title}`);
}

/** 断言「这里必须抛」，并返回错误信息用于后续断言。 */
async function throws(fn) {
  try {
    await fn();
    return { threw: false, message: "" };
  } catch (error) {
    return { threw: true, message: String(error?.message ?? error) };
  }
}

function readText(relative) {
  return readFileSync(join(targetDir, relative), "utf8");
}

// 构建产物文件名带 hash，按模式找，避免改名后套件失效
const libFiles = readdirSync(join(targetDir, "lib"));
const hostFile = libFiles.find((name) => /^host-heartbeat-.*\.js$/u.test(name));
if (hostFile === undefined) {
  console.error(`✗ 找不到 host bundle（lib/host-heartbeat-*.js）于 ${targetDir}`);
  process.exit(2);
}
const hb = await import(pathToFileURL(join(targetDir, "lib", hostFile)).href);

const {
  $: validAppVersion,
  A: extractDisplayErrorMessage,
  L: regionOf,
  M: normalizeCredits,
  N: parseModelCatalog,
  O: WorkBuddyUpstreamClient,
  U: chatUserAgent,
  W: fallbackChatIdentity,
  k: classifyUpstreamError,
  v: parseWorkBuddyAuth,
} = hb;

const CN_CREDENTIAL = {
  accessToken: "SECRET-CN-TOKEN-9f3a",
  refreshToken: "SECRET-CN-REFRESH",
  domain: "www.workbuddy.cn",
  uid: "uid-cn",
  enterpriseId: "",
  expiresAtMs: Date.now() + 3_600_000,
};

const realFetch = globalThis.fetch;
function stubFetch(handler) {
  globalThis.fetch = handler;
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}
function jsonResponse(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

console.log(`场景套件：${targetDir}`);
console.log(`隔离 DSH_HOME：${sandboxHome}`);

// ─────────────────────────────────────────────────────────────
section("S1 凭据：坏文件不能变成崩溃，也不能变成「已登录」");

check("S1.1", "空文本 → 无凭据", parseWorkBuddyAuth("") === undefined);
check("S1.2", "坏 JSON → 无凭据（不抛）", parseWorkBuddyAuth("{not json") === undefined);
check("S1.3", "JSON 数组 → 无凭据", parseWorkBuddyAuth("[1,2,3]") === undefined);
check("S1.4", "缺 accessToken → 无凭据", parseWorkBuddyAuth(JSON.stringify({ account: { uid: "u" } })) === undefined);
check(
  "S1.5",
  "accessToken 为空串 → 无凭据",
  parseWorkBuddyAuth(JSON.stringify({ auth: { accessToken: "" } })) === undefined,
);
check(
  "S1.6",
  "accessToken 非字符串 → 无凭据",
  parseWorkBuddyAuth(JSON.stringify({ auth: { accessToken: 12345 } })) === undefined,
);

const nested = parseWorkBuddyAuth(
  JSON.stringify({ auth: { accessToken: "tok-n", expiresAt: Date.now() + 1e6 }, account: { uid: "u1", domain: "www.workbuddy.cn" } }),
);
check("S1.7", "嵌套形态（plugin OAuth）可取到 token", nested?.accessToken === "tok-n", JSON.stringify(nested ?? null).slice(0, 120));

const flat = parseWorkBuddyAuth(JSON.stringify({ accessToken: "tok-f", uid: "u2", domain: "www.workbuddy.ai" }));
check("S1.8", "扁平形态（面板导出）可取到 token", flat?.accessToken === "tok-f");
check("S1.9", "扁平形态保留域，用于区域判定", flat !== undefined && regionOf(flat.domain) === "global");

// ─────────────────────────────────────────────────────────────
section("S2 上游错误分类：每种失败都要能归因");

check("S2.1", "402 → hard_credit（额度真的没了）", classifyUpstreamError(402, "") === "hard_credit");
check("S2.2", "401 → session_dead（要重新登录）", classifyUpstreamError(401, "") === "session_dead");
check("S2.3", "429 → soft_rate（可重试）", classifyUpstreamError(429, "") === "soft_rate");
check("S2.4", "404 → not_found", classifyUpstreamError(404, "") === "not_found");
check("S2.5", "500 → server", classifyUpstreamError(500, "") === "server");
check("S2.6", "503 → server", classifyUpstreamError(503, "") === "server");
check("S2.7", "400 → client", classifyUpstreamError(400, "") === "client");
check("S2.8", "body 含 12153 → session_dead（即使 HTTP 400）", classifyUpstreamError(400, "12153 session gone") === "session_dead");
check("S2.9", "body 含 credits exhausted → hard_credit", classifyUpstreamError(400, "credits exhausted") === "hard_credit");

check("S2.10", "displayMsg.zh 优先于 en", extractDisplayErrorMessage(JSON.stringify({ displayMsg: { zh: "中文提示", en: "english" } })) === "中文提示");
check("S2.11", "缺 zh 时回落 en", extractDisplayErrorMessage(JSON.stringify({ displayMsg: { en: "english only" } })) === "english only");
check("S2.12", "无 displayMsg 时回落 msg", extractDisplayErrorMessage(JSON.stringify({ msg: "plain" })) === "plain");
check("S2.13", "非 JSON body → undefined（不抛）", extractDisplayErrorMessage("<html>502</html>") === undefined);
check("S2.14", "JSON 数组 → undefined", extractDisplayErrorMessage("[1,2]") === undefined);

// ─────────────────────────────────────────────────────────────
section("S3 客户端：错误路径不崩、不误报成功、凭据只走请求头");

const client = new WorkBuddyUpstreamClient();
const CHAT_BODY = JSON.stringify({ model: "deepseek-v4.1-flash", stream: true, messages: [{ role: "user", content: "hi" }] });

async function chatWith(stub) {
  stubFetch(stub);
  try {
    return await client.chatStream(CN_CREDENTIAL, CHAT_BODY);
  } finally {
    restoreFetch();
  }
}

const r400 = await chatWith(async () => jsonResponse(400, { msg: "bad request" }));
check("S3.1", "400 → ok=false / status=400 / kind=client", r400.ok === false && r400.status === 400 && r400.kind === "client", JSON.stringify(r400).slice(0, 120));

const r401 = await chatWith(async () => jsonResponse(401, { msg: "unauthorized" }));
check("S3.2", "401 → kind=session_dead", r401.ok === false && r401.kind === "session_dead");

const r500 = await chatWith(async () => jsonResponse(500, "upstream exploded"));
check("S3.3", "500 → kind=server", r500.ok === false && r500.kind === "server");

const rNet = await chatWith(async () => {
  throw new Error("ECONNRESET");
});
check("S3.4", "网络异常 → status=0 且归因为 server（不是静默成功）", rNet.ok === false && rNet.status === 0 && rNet.kind === "server", JSON.stringify(rNet).slice(0, 120));

const rOk = await chatWith(async () => jsonResponse(200, "data: {}\n\n"));
check("S3.5", "200 → ok=true", rOk.ok === true);

let capturedUrl = "";
let capturedAuth = "";
await chatWith(async (url, init) => {
  capturedUrl = String(url);
  capturedAuth = String(init?.headers?.Authorization ?? "");
  return jsonResponse(200, "data: {}\n\n");
});
check("S3.6", "凭据只出现在 Authorization 头", capturedAuth === `Bearer ${CN_CREDENTIAL.accessToken}`, capturedAuth.slice(0, 40));
check("S3.7", "请求 URL 不得携带 token（避免进日志）", !capturedUrl.includes(CN_CREDENTIAL.accessToken), capturedUrl);

const huge = "x".repeat(10_000);
const rHuge = await chatWith(async () => jsonResponse(400, huge));
check("S3.8", "超长错误体被截断（≤4096），不把整包塞进消息", rHuge.ok === false && String(rHuge.message).length <= 4096, String(String(rHuge.message).length));

// ─────────────────────────────────────────────────────────────
section("S4 积分：区域门是承重的，畸形响应要报错而不是报 0");

async function creditsWith(credential, handler) {
  stubFetch(handler);
  try {
    return { value: await client.fetchCredits(credential), error: undefined, url: globalThis.__lastUrl };
  } catch (error) {
    return { value: undefined, error: String(error?.message ?? error), url: globalThis.__lastUrl };
  } finally {
    restoreFetch();
  }
}

let lastUrl = "";
stubFetch(async (url) => {
  lastUrl = String(url);
  return jsonResponse(200, { code: 0, data: { Response: { Data: { Accounts: [] } } } });
});
const personalCn = await client.fetchCredits(CN_CREDENTIAL);
restoreFetch();
check("S4.1", "国内个人账号走 codebuddy 计费端点", lastUrl.startsWith("https://www.codebuddy.cn/v2/billing/meter/get-user-resource"), lastUrl);
check("S4.2", "空 Accounts → total=0（不是 NaN）", personalCn.total === 0 && Number.isFinite(personalCn.total), JSON.stringify(personalCn).slice(0, 120));

lastUrl = "";
stubFetch(async (url) => {
  lastUrl = String(url);
  return jsonResponse(200, { code: 0, data: { Response: { Data: { Accounts: [] } } } });
});
await client.fetchCredits({ ...CN_CREDENTIAL, domain: "www.workbuddy.ai", enterpriseId: "ent-1" });
restoreFetch();
check(
  "S4.3",
  "国际账号即使带 enterpriseId 也留在个人端点（企业端点未验证）",
  lastUrl.startsWith("https://www.workbuddy.ai/v2/billing/meter/get-user-resource"),
  lastUrl,
);

lastUrl = "";
stubFetch(async (url) => {
  lastUrl = String(url);
  return jsonResponse(200, { code: 0, data: { data: { limitNum: 100, used_num: 30 } } });
});
const enterprise = await client.fetchCredits({ ...CN_CREDENTIAL, enterpriseId: "ent-1" });
restoreFetch();
check("S4.4", "国内企业账号走企业端点", lastUrl.startsWith("https://www.codebuddy.cn/v2/billing/meter/get-enterprise-user-usage"), lastUrl);
check("S4.5", "企业额度 limit-used 计算正确", enterprise.total === 70, JSON.stringify(enterprise).slice(0, 120));

const negRemain = await (async () => {
  stubFetch(async () => jsonResponse(200, {
    code: 0,
    data: { Response: { Data: { Accounts: [{ PackageName: "p", CycleCapacitySize: 100, CycleCapacityRemain: -50, CycleCapacityUsed: 150 }] } } },
  }));
  try {
    return await client.fetchCredits(CN_CREDENTIAL);
  } finally {
    restoreFetch();
  }
})();
check("S4.6", "负数余额被夹到 0（不显示负积分）", negRemain.total === 0, JSON.stringify(negRemain).slice(0, 120));

const badEnvelope = await throws(async () => {
  stubFetch(async () => jsonResponse(200, { code: 11128, msg: "请求被拦截" }));
  try {
    await client.fetchCredits(CN_CREDENTIAL);
  } finally {
    restoreFetch();
  }
});
check("S4.7", "业务码非 0 → 抛错且带可归因分类", badEnvelope.threw && /workbuddy upstream client/u.test(badEnvelope.message), badEnvelope.message.slice(0, 120));

const nonJson = await throws(async () => {
  stubFetch(async () => jsonResponse(200, "<html>not json</html>"));
  try {
    await client.fetchCredits(CN_CREDENTIAL);
  } finally {
    restoreFetch();
  }
});
check("S4.8", "非 JSON 响应 → 明确报「非 JSON」而非 TypeError", nonJson.threw && /non-JSON/u.test(nonJson.message), nonJson.message.slice(0, 120));

const unlimited = await (async () => {
  stubFetch(async () => jsonResponse(200, { code: 0, data: { data: { limitNum: -1, used_num: 5 } } }));
  try {
    return await client.fetchCredits({ ...CN_CREDENTIAL, enterpriseId: "ent-1" });
  } finally {
    restoreFetch();
  }
})();
check("S4.9", "企业 limitNum=-1 → 标为不限量（不是 0）", unlimited.unlimited === true, JSON.stringify(unlimited).slice(0, 120));

const noQuota = await throws(async () => {
  stubFetch(async () => jsonResponse(200, { code: 0, data: { data: { somethingElse: 1 } } }));
  try {
    await client.fetchCredits({ ...CN_CREDENTIAL, enterpriseId: "ent-1" });
  } finally {
    restoreFetch();
  }
});
check("S4.10", "企业响应缺额度字段 → 报错（不静默显示 0）", noQuota.threw && /quota field/u.test(noQuota.message), noQuota.message.slice(0, 160));

// ─────────────────────────────────────────────────────────────
section("S5 模型目录：畸形目录要报错，不能渲染成空白面板");

const noCli = await throws(() => parseModelCatalog({ models: [], agents: [] }));
check("S5.1", "没有 cli agent → 抛错（明确文案）", noCli.threw && /cli agent/u.test(noCli.message), noCli.message.slice(0, 120));

const allDisabled = await throws(() =>
  parseModelCatalog({
    models: [{ id: "m1", maxInputTokens: 100, maxOutputTokens: 10, disabled: true }],
    agents: [{ name: "cli", models: ["m1"] }],
  }),
);
check("S5.2", "cli 声明的模型全被禁用 → 抛错（不是空列表）", allDisabled.threw && /empty list/u.test(allDisabled.message), allDisabled.message.slice(0, 120));

const catalog = parseModelCatalog({
  models: [
    { id: "m1", name: "M1", maxInputTokens: 1000, maxOutputTokens: 100, credits: "x0.11 credits" },
    { id: "m2", name: "M2", maxInputTokens: 0, maxOutputTokens: 100 },
    { id: "m3", name: "M3", maxInputTokens: 1000, maxOutputTokens: 100, credits: "x0.00 credits" },
  ],
  agents: [{ name: "cli", models: ["m1", "m2", "m3"] }],
});
check("S5.3", "缺失上下文档的模型被过滤（m2 不出现）", catalog.every((m) => m.id !== "m2"), catalog.map((m) => m.id).join(","));
check("S5.4", "积分倍率去掉单位词（x0.11 credits → x0.11）", normalizeCredits(catalog.find((m) => m.id === "m1")?.billing?.credits) === "x0.11");
check("S5.5", "x0.00 标记为免费", catalog.find((m) => m.id === "m3")?.billing?.free === true);

// ─────────────────────────────────────────────────────────────
section("S6 身份与 UA：版本号不合法要拒绝，UA 不能被注入");

check("S6.1", "版本号含换行 → 不合法（防 header 注入）", validAppVersion("5.9.3\r\nX-Evil: 1") === false);
check("S6.2", "正常版本号 → 合法", validAppVersion("5.9.3") === true);

const badUa = await throws(() => chatUserAgent({ clientVersion: "not-a-version" }, "cn"));
check("S6.3", "非法客户端版本 → 抛错（不发出畸形 UA）", badUa.threw);

const cnUa = chatUserAgent({ clientVersion: "5.9.3" }, "cn");
const globalUa = chatUserAgent({ clientVersion: "5.8.4" }, "global");
check("S6.4", "国内 UA 用 WorkBuddy/ 前缀", cnUa.startsWith("WorkBuddy/5.9.3"), cnUa);
check("S6.5", "国际 UA 用 WorkBuddy AI/ 前缀", globalUa.includes("WorkBuddy AI/5.8.4"), globalUa);
check("S6.6", "UA 不含换行（header 安全）", !/[\r\n]/u.test(cnUa) && !/[\r\n]/u.test(globalUa));

const fallbackCn = fallbackChatIdentity("cn");
check("S6.7", "兜底身份给出合法版本号", validAppVersion(fallbackCn.clientVersion) === true, String(fallbackCn.clientVersion));

// ─────────────────────────────────────────────────────────────
section("S7 路由与安全：本机回环守卫不能被拆掉（源码断言）");

const indexText = readText("lib/index.js");
const clientText = readText("lib/client.js");

check("S7.1", "status 路由先过 loopbackRequest 守卫", /if \(!loopbackRequest\(req\)\)/u.test(indexText));
check("S7.2", "status 路由拒绝非 GET（405）", /405, \{ error: "method not allowed" \}/u.test(indexText));
check("S7.3", "update 路由同样有回环守卫", /if \(!browserRequestAllowed\(req\)\)/u.test(indexText));
check("S7.4", "probe 路由用 timingSafeEqual 比对 key", /timingSafeEqual/u.test(indexText));
check(
  "S7.5",
  "宿主与浏览器两半的路由字面量一致",
  (() => {
    const hostText = readText(join("lib", hostFile));
    const pick = (text) => [...text.matchAll(/"(\/plugins\/[A-Za-z0-9/_-]+)"/gu)].map((m) => m[1]).sort().join(",");
    const hostPaths = pick(hostText);
    return hostPaths !== "" && hostPaths === pick(clientText);
  })(),
);

// ─────────────────────────────────────────────────────────────
section("S8 体系自检：测什么这件事本身不能丢");

check("S8.1", "README 存在且写明包名", (() => {
  const readme = join(targetDir, "README.md");
  return existsSync(readme) && readFileSync(readme, "utf8").includes("dsh-workbuddy-model");
})());
check("S8.2", "发布清单里的每一项都在磁盘上", (() => {
  // 少一个文件 = npm 上装下来缺东西；多写一个不存在的 = 清单本身在撒谎。
  const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8"));
  return manifest.files.every((entry) => existsSync(join(targetDir, entry)));
})());
check("S8.3", ".gitignore 忽略 .local/（本机信息不进仓库）", (() => {
  const ignore = join(targetDir, ".gitignore");
  if (!existsSync(ignore)) return false;
  return readFileSync(ignore, "utf8")
    .split(/\r?\n/u)
    .some((line) => line.trim().replace(/\/$/u, "") === ".local");
})());
check("S8.4", "四个工具都在", ["run-tests.mjs", "scenarios.mjs", "check-installed.mjs", "mutate-tests.cjs"].every((name) => existsSync(join(targetDir, "tools", name))));
check("S8.5", "CI 已接线（跑契约与场景两个套件）", (() => {
  const ci = join(targetDir, ".github", "workflows", "ci.yml");
  if (!existsSync(ci)) return false;
  const text = readFileSync(ci, "utf8");
  return text.includes("tools/run-tests.mjs") && text.includes("tools/scenarios.mjs");
})());

// ─────────────────────────────────────────────────────────────
rmSync(sandboxHome, { recursive: true, force: true });

console.log(`\n${"=".repeat(60)}`);
console.log(`PASS ${pass}   FAIL ${fail}   SKIP ${skipped.length}`);
if (failures.length > 0) {
  console.log("\n失败项：");
  for (const item of failures) console.log(`  - ${item}`);
}
if (skipped.length > 0) {
  console.log("\n跳过项：");
  for (const item of skipped) console.log(`  - ${item}`);
}
process.exit(fail === 0 ? 0 : 1);
