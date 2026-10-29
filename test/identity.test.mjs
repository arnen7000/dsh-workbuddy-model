// 身份契约：User-Agent 的形状与安全性，以及"读不到就降级、绝不抛错"的承诺。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  $ as validAppVersion,
  q as validCliVersion,
  U as chatUserAgent,
  K as resolveChatIdentity,
  W as fallbackChatIdentity,
  X as installedAppVersion,
  L as regionOf,
  k as classifyUpstreamError,
  A as extractDisplayErrorMessage,
  M as normalizeCredits,
} from "../lib/host-heartbeat-SJaZ33tR.js";

const CN = fallbackChatIdentity("cn");
const GLOBAL = fallbackChatIdentity("global");

test("UA 形状：国内是 WorkBuddy/<v> WorkBuddy/<v>", () => {
  assert.equal(chatUserAgent({ clientVersion: "5.9.3" }, "cn"), "WorkBuddy/5.9.3 WorkBuddy/5.9.3");
});

test("UA 形状：国际是 WorkBuddy/<v> WorkBuddy AI/<v>", () => {
  assert.equal(chatUserAgent({ clientVersion: "5.8.4" }, "global"), "WorkBuddy/5.8.4 WorkBuddy AI/5.8.4");
});

test("UA 形状：有 CLI 版本时追加 CLI/<v>", () => {
  assert.equal(chatUserAgent({ clientVersion: "5.9.3", cliVersion: "2.63.2" }, "cn"), "WorkBuddy/5.9.3 WorkBuddy/5.9.3 CLI/2.63.2");
});

test("UA 安全性：版本号里的 CR/LF/空格一律拒绝（防 header 注入）", () => {
  for (const bad of ["5.9.3\r\nX-Injected: 1", "5.9.3\n", "5.9.3 5.9.3", "5.9.3;", ""]) {
    assert.throws(() => chatUserAgent({ clientVersion: bad }, "cn"), undefined, `应拒绝 ${JSON.stringify(bad)}`);
  }
});

test("UA 安全性：CLI 版本同样过闸", () => {
  assert.throws(() => chatUserAgent({ clientVersion: "5.9.3", cliVersion: "2.63.2\r\nX: 1" }, "cn"));
});

test("版本校验：接受 2~4 段数字，拒绝 1 段与 5 段", () => {
  for (const good of ["1.2", "5.9.3", "5.8.4.1", "123456.1"]) assert.equal(validAppVersion(good), true, good);
  for (const bad of ["1", "1.2.3.4.5", "v5.9.3", "5.9.3-rc.1", " 5.9.3", ""]) assert.equal(validAppVersion(bad), false, bad);
});

test("CLI 版本允许预发布后缀", () => {
  assert.equal(validCliVersion("2.137.1-rc.1"), true);
  assert.equal(validCliVersion("2.137.1\n"), false);
});

test("身份解析：国内优先用已安装 App 的版本", async () => {
  const identity = await resolveChatIdentity("cn", { installedCn: async () => ({ version: "5.9.3", bundle: "/x" }), cliVersion: async () => undefined });
  assert.equal(identity.clientVersion, "5.9.3");
});

test("身份解析：读不到 App 时用缓存文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wbm-id-"));
  const saved = join(dir, "cn.json");
  writeFileSync(saved, JSON.stringify({ version: "5.7.1" }));
  try {
    const identity = await resolveChatIdentity("cn", { installedCn: async () => undefined, cnSavedPath: saved });
    assert.equal(identity.clientVersion, "5.7.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("身份解析：什么都读不到时用内置兜底，且不抛错", async () => {
  const identity = await resolveChatIdentity("cn", { installedCn: async () => undefined, cnSavedPath: join(tmpdir(), "definitely-missing.json") });
  assert.equal(identity.clientVersion, CN.clientVersion);
});

test("身份解析：读取器抛错也降级，绝不打断消息", async () => {
  const identity = await resolveChatIdentity("cn", {
    installedCn: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(identity.clientVersion, CN.clientVersion);
});

test("身份解析：国际走自己的解析链，并带 CLI 版本", async () => {
  const identity = await resolveChatIdentity("global", {
    resolveIntl: async () => ({ version: "5.8.4", bundle: "/Applications/x" }),
    cliVersion: async () => "2.63.2",
  });
  assert.deepEqual(identity, { clientVersion: "5.8.4", cliVersion: "2.63.2" });
});

test("身份解析：没有 bundle 路径时丢掉 CLI 段（不编造）", async () => {
  const identity = await resolveChatIdentity("global", {
    resolveIntl: async () => ({ version: "5.8.4" }),
    cliVersion: async () => "2.63.2",
  });
  assert.equal("cliVersion" in identity, false);
});

test("非 darwin 平台不猜 macOS bundle 路径", async () => {
  // 本机是 win32；这里断言的是"不会去读 /Applications 然后假装成功"
  const installed = await installedAppVersion();
  assert.equal(installed, undefined);
});

test("区域判定：.workbuddy.ai 归国际，其余（含空）归国内", () => {
  assert.equal(regionOf("www.workbuddy.ai"), "global");
  assert.equal(regionOf("WorkBuddy.AI"), "global");
  assert.equal(regionOf("www.workbuddy.cn"), "cn");
  assert.equal(regionOf(""), "cn");
});

test("错误分类：状态码优先，其次文案标记", () => {
  assert.equal(classifyUpstreamError(402, ""), "hard_credit");
  assert.equal(classifyUpstreamError(401, ""), "session_dead");
  assert.equal(classifyUpstreamError(429, ""), "soft_rate");
  assert.equal(classifyUpstreamError(404, ""), "not_found");
  assert.equal(classifyUpstreamError(500, ""), "server");
  assert.equal(classifyUpstreamError(400, ""), "client");
  assert.equal(classifyUpstreamError(200, ""), "client");
  assert.equal(classifyUpstreamError(400, "积分不足"), "hard_credit");
  assert.equal(classifyUpstreamError(500, "insufficient credit"), "hard_credit");
});

test("错误文案：优先 displayMsg.zh，其次 en，最后 msg", () => {
  assert.equal(extractDisplayErrorMessage('{"displayMsg":{"zh":"请求被拦截","en":"blocked"}}'), "请求被拦截");
  assert.equal(extractDisplayErrorMessage('{"displayMsg":{"en":"blocked"}}'), "blocked");
  assert.equal(extractDisplayErrorMessage('{"msg":"plain"}'), "plain");
  assert.equal(extractDisplayErrorMessage("not json"), undefined);
  assert.equal(extractDisplayErrorMessage('{"displayMsg":{}}'), undefined);
});

test("额度文案：去掉单位词，保留倍率", () => {
  assert.equal(normalizeCredits("x0.79 credits"), "x0.79");
  assert.equal(normalizeCredits("x0.00"), "x0.00");
  assert.equal(normalizeCredits("credits"), undefined);
  assert.equal(normalizeCredits("  "), undefined);
  assert.equal(normalizeCredits(undefined), undefined);
});
