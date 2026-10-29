#!/usr/bin/env node
// 联网冒烟：唯一能发现"上游改了规则"的检查。
//
// 离线测试只能保证"我们的请求体符合已知契约"；国内网关那条 400/11128 是上游行为，
// 只有真的打一次才知道它还成不成立。所以这个脚本不放进默认测试，必须显式开启：
//
//   WORKBUDDY_SMOKE=1 node tools/smoke-live.mjs
//   WORKBUDDY_SMOKE=1 DSH_HOME=/path/to/.dsh node tools/smoke-live.mjs
//
// 没有凭据的区域记为 SKIP，不算失败（换台机器没装 App 也能跑）。
// 输出只含状态码与错误码，不含任何 token 内容。
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lib = await import(`file://${resolve(root, "lib/host-heartbeat-SJaZ33tR.js").replace(/\\/gu, "/")}`);

if (process.env.WORKBUDDY_SMOKE !== "1") {
  console.log("SKIP  联网冒烟默认关闭；用 WORKBUDDY_SMOKE=1 开启");
  process.exit(0);
}

const client = new lib.O();
const failures = [];

for (const variant of lib.C) {
  const label = `${variant.displayName}(${variant.region})`;
  let credential;
  try {
    const store = new lib.m({
      variant,
      refresh: (c) => client.refreshToken(c),
      keyProvider: lib.b(variant),
    });
    credential = await store.resolve();
  } catch (error) {
    console.log(`SKIP  ${label} 无可用凭据：${String(error.message ?? error).slice(0, 120)}`);
    continue;
  }

  // 真实形状：带一段系统提示 + 一句话，走与 shim 相同的归一化路径
  const body = {
    model: variant.region === "global" ? "deepseek-v4.1-flash" : "deepseek-v4.1-flash",
    stream: true,
    max_tokens: 32,
    messages: [
      { role: "system", content: "You are an AI agent powered by DeepSeek Harness." },
      { role: "user", content: "只回复 OK 两个字。" },
    ],
  };
  const prepare = variant.region === "global" ? lib.I : lib.F;
  const result = await client.chatStream(credential, prepare(JSON.stringify(body)));

  if (result.ok) {
    await result.response.body?.cancel().catch(() => {});
    console.log(`PASS  ${label} HTTP ${result.response.status}`);
    continue;
  }
  let code = "";
  try {
    code = JSON.parse(result.message).code;
  } catch {}
  console.log(`FAIL  ${label} HTTP ${result.status} code=${code || "-"}`);
  failures.push(label);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} 个区域失败：${failures.join(", ")}`);
  console.log("国内 400/11128 说明网关又收紧了 system 角色的校验（见 README「已知限制」）。");
  process.exit(1);
}
console.log("\nSMOKE OK");
