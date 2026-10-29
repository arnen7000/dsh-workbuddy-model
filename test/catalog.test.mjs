// 目录契约：两个区域的兜底模型表必须各自完整，否则面板在首次拉取失败时会空白。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  u as FALLBACK_CN,
  l as FALLBACK_AI,
  C as VARIANTS,
} from "../lib/host-heartbeat-SJaZ33tR.js";

for (const [label, models] of [
  ["国内", FALLBACK_CN],
  ["国际", FALLBACK_AI],
]) {
  test(`${label}兜底目录非空且字段完整`, () => {
    assert.ok(Array.isArray(models) && models.length > 0, "兜底目录不能为空");
    for (const model of models) {
      assert.equal(typeof model.id, "string");
      assert.ok(model.id.length > 0, "模型 id 不能为空");
      assert.equal(typeof model.contextWindow, "number");
      assert.ok(model.contextWindow > 0, `${model.id} 的 contextWindow 必须为正`);
      assert.equal(typeof model.maxTokens, "number");
      assert.ok(model.maxTokens > 0, `${model.id} 的 maxTokens 必须为正`);
    }
  });

  test(`${label}兜底目录里 id 唯一`, () => {
    const ids = models.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `重复 id: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(",")}`);
  });
}

test("两个区域的兜底目录是各自独立的（不共用一份）", () => {
  assert.notEqual(FALLBACK_CN, FALLBACK_AI);
});

test("两个变体各自声明了区域，且不重复", () => {
  const regions = VARIANTS.map((v) => v.region);
  assert.deepEqual(regions, ["cn", "global"]);
});

test("两个变体的 provider id 唯一（宿主按 id 去重，重复注册会静默不激活）", () => {
  const ids = VARIANTS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
});
