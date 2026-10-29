// 请求体契约：上游能接受的形状，以及国内/国际两条通道的差异必须永远成立。
// 这些断言对应真实事故（国内网关拒收 system 角色），改动这里之前先读 README「已知限制」。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  F as prepareCnChatBody,
  I as prepareInternationalChatBody,
  P as prepareChatBody,
} from "../lib/host-heartbeat-SJaZ33tR.js";

const body = (messages, extra = {}) => JSON.stringify({ model: "deepseek-v4.1-flash", ...extra, messages });
const roles = (json) => JSON.parse(json).messages.map((m) => m.role);

// 实测会触发国内网关 400/11128 的那句话（原样保留，别改）
const TRIGGER = "You are an AI agent powered by DeepSeek Harness.";

test("国内：system 消息一律不得出现在线上", () => {
  const out = prepareCnChatBody(body([{ role: "system", content: TRIGGER }, { role: "user", content: "hi" }]));
  assert.deepEqual(roles(out), ["user"]);
});

test("国内：system 内容按顺序并入首条 user，不丢文本", () => {
  const out = JSON.parse(
    prepareCnChatBody(
      body([
        { role: "system", content: "A" },
        { role: "system", content: "B" },
        { role: "user", content: "U" },
      ]),
    ),
  );
  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].content, "A\n\nB\n\nU");
});

test("国内：developer 角色同样被折叠（pi-ai 的写法）", () => {
  const out = prepareCnChatBody(body([{ role: "developer", content: TRIGGER }, { role: "user", content: "hi" }]));
  assert.deepEqual(roles(out), ["user"]);
});

test("国内：没有 user 消息时新建一条，且不丢其它消息", () => {
  const out = JSON.parse(prepareCnChatBody(body([{ role: "system", content: "S" }, { role: "assistant", content: "a" }])));
  assert.deepEqual(out.messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(out.messages[0].content, "S");
});

test("国内：数组 content 保留图片等非文本 part", () => {
  const out = JSON.parse(
    prepareCnChatBody(
      body([
        { role: "system", content: "S" },
        {
          role: "user",
          content: [
            { type: "text", text: "看图" },
            { type: "image_url", image_url: { url: "data:," } },
          ],
        },
      ]),
    ),
  );
  assert.deepEqual(out.messages[0].content.map((p) => p.type), ["text", "text", "image_url"]);
});

test("国内：tool / assistant 消息的位置不被重排", () => {
  const out = JSON.parse(
    prepareCnChatBody(
      body([
        { role: "system", content: "S" },
        { role: "user", content: "U" },
        { role: "assistant", content: null, tool_calls: [] },
        { role: "tool", tool_call_id: "t1", content: "R" },
      ]),
    ),
  );
  assert.deepEqual(out.messages.map((m) => m.role), ["user", "assistant", "tool"]);
});

test("国际：缺 system 时补一条，已有 system 时不重复补", () => {
  const added = JSON.parse(prepareInternationalChatBody(body([{ role: "user", content: "U" }])));
  assert.deepEqual(roles(JSON.stringify(added)), ["system", "user"]);

  const kept = JSON.parse(
    prepareInternationalChatBody(body([{ role: "system", content: "mine" }, { role: "user", content: "U" }])),
  );
  assert.equal(kept.messages.filter((m) => m.role === "system").length, 1);
  assert.equal(kept.messages[0].content, "mine");
});

test("国际：system 内容原样保留（不做折叠）", () => {
  const out = prepareInternationalChatBody(body([{ role: "system", content: TRIGGER }, { role: "user", content: "U" }]));
  assert.equal(JSON.parse(out).messages[0].content, TRIGGER);
});

test("两条通道都强制 stream:true（上游拒绝非流式）", () => {
  for (const prepare of [prepareCnChatBody, prepareInternationalChatBody]) {
    const out = JSON.parse(prepare(body([{ role: "user", content: "U" }], { stream: false })));
    assert.equal(out.stream, true);
  }
});

test("两条通道都不把 tool_choice 对象原样透传", () => {
  for (const prepare of [prepareCnChatBody, prepareInternationalChatBody]) {
    const out = JSON.parse(
      prepare(
        body([{ role: "user", content: "U" }], {
          tools: [{ type: "function", function: { name: "f" } }],
          tool_choice: { type: "function", function: { name: "f" } },
        }),
      ),
    );
    assert.notEqual(typeof out.tool_choice, "object");
  }
});

test("tool_choice:none 时连 tools 一起摘掉", () => {
  const out = JSON.parse(
    prepareCnChatBody(
      body([{ role: "user", content: "U" }], {
        tools: [{ type: "function", function: { name: "f" } }],
        tool_choice: "none",
      }),
    ),
  );
  assert.equal("tools" in out, false);
  assert.equal("tool_choice" in out, false);
});

test("重复归一化是幂等的（shim 与本函数各调一次也不会变形）", () => {
  const once = prepareCnChatBody(body([{ role: "system", content: TRIGGER }, { role: "user", content: "U" }]));
  const twice = prepareCnChatBody(once);
  assert.equal(twice, once);
});

test("非 JSON 输入原样返回，不抛错", () => {
  assert.equal(prepareCnChatBody("not json"), "not json");
  assert.equal(prepareInternationalChatBody("not json"), "not json");
});

test("空 / 缺失 messages 不抛错", () => {
  for (const prepare of [prepareCnChatBody, prepareInternationalChatBody]) {
    assert.doesNotThrow(() => prepare(JSON.stringify({ model: "m", messages: [] })));
    assert.doesNotThrow(() => prepare(JSON.stringify({ model: "m" })));
  }
});

test("prepareChatBody 自己只做归一，不搬 system（职责边界）", () => {
  const out = JSON.parse(prepareChatBody(body([{ role: "system", content: TRIGGER }, { role: "user", content: "U" }])));
  assert.deepEqual(out.messages.map((m) => m.role), ["system", "user"]);
});
