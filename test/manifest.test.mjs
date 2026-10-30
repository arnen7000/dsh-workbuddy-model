// 清单契约：改名、发版、宿主加载三者之间的一致性。
// 这类错误不会报错，只会让插件"装上了但不生效"——所以必须有断言兜住。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const hostBundle = read("lib/host-heartbeat-SJaZ33tR.js");
const clientBundle = read("lib/client.js");
const indexBundle = read("lib/index.js");
const patch = read("cordis.patch.yml");

const routeLiterals = (text) => [...new Set(text.match(/\/plugins\/[A-Za-z0-9/_-]+/gu) ?? [])].sort();

test("包名与 patch 行名、客户端 BUNDLE_NAME 一致", () => {
  const bundleName = /const BUNDLE_NAME = "([^"]+)"/u.exec(clientBundle)?.[1];
  const patchName = [...patch.matchAll(/^\s*name:\s*(\S+)\s*$/gmu)].map((m) => m[1]);
  assert.equal(pkg.name, "dsh-workbuddy-model");
  assert.equal(bundleName, pkg.name, "client.js 的 BUNDLE_NAME 必须等于包名");
  assert.deepEqual(patchName, [pkg.name], "cordis.patch.yml 的行名必须等于包名");
});

test("bin 命令名与包名一致", () => {
  assert.deepEqual(Object.keys(pkg.bin), [pkg.name]);
  assert.ok(existsSync(join(root, pkg.bin[pkg.name])), "bin 指向的文件必须存在");
});

test("lib 内嵌版本号与 package.json 版本一致", () => {
  const inHost = /const WORKBUDDY_CONNECT_VERSION = "([^"]+)"/u.exec(hostBundle)?.[1];
  const inClient = /const WORKBUDDY_CONNECT_VERSION = "([^"]+)"/u.exec(clientBundle)?.[1];
  assert.equal(inHost, pkg.version, "host bundle 的版本号漂移了");
  assert.equal(inClient, pkg.version, "client bundle 的版本号漂移了");
});

test("宿主与浏览器两半的路由字面量完全一致", () => {
  // 两半是独立打包的，路由写错不会报错，只会让面板一直空着
  assert.deepEqual(routeLiterals(clientBundle), routeLiterals(hostBundle));
});

test("index.js 不自己写路由字面量（只从 host bundle 取）", () => {
  assert.deepEqual(routeLiterals(indexBundle), [], "index.js 里出现了硬编码路由");
});

test("exports 与 dsh.bundle 指向的文件都存在", () => {
  for (const [key, value] of Object.entries(pkg.exports)) {
    const target = typeof value === "string" ? value : value.default;
    assert.ok(existsSync(join(root, target)), `exports["${key}"] 指向的 ${target} 不存在`);
  }
  assert.ok(existsSync(join(root, pkg.dsh.bundle.patch)), "dsh.bundle.patch 指向的文件不存在");
});

test("发布文件清单包含宿主运行所需的全部内容", () => {
  for (const required of ["lib", "cordis.patch.yml"]) {
    assert.ok(pkg.files.includes(required), `files 缺少 ${required}`);
  }
});

test("发布文件清单必须带许可证与第三方声明", () => {
  // lib/ 里打包了 @deepseek-ai/dsh-atomic-write（MIT，DeepSeek 版权），
  // 而 LICENSE 是上游 Corrine Hu 的 MIT。两份文本必须一起发出去。
  for (const required of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
    assert.ok(pkg.files.includes(required), `files 缺少 ${required}：发到 npm 就构成许可证缺失`);
    assert.ok(existsSync(join(root, required)), `${required} 在仓库里不存在`);
  }
  assert.match(read("LICENSE"), /MIT License/u);
  assert.match(read("THIRD_PARTY_NOTICES.txt"), /MIT License/u);
});

test("实现只来自 lib/（本仓库发预构建产物，没有可重建的源码树）", () => {
  // 曾经的教训：仓库里留一份落后于 lib/ 的源码快照，`build` 一跑就把线上修补
  // 静默换掉，而且构建全绿。现在唯一实现来源就是 lib/，代码入口不许指到别处。
  // 非代码导出（patch 配置、package.json 自身）不算入口。
  const ASSETS = new Set(["./cordis.patch.yml", "./package.json"]);
  const entryPoints = [pkg.main, pkg.types, ...Object.values(pkg.bin ?? {})].filter(Boolean);
  for (const value of Object.values(pkg.exports).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v ?? {})))) {
    if (!ASSETS.has(value)) entryPoints.push(value);
  }
  for (const entry of entryPoints) {
    assert.match(entry, /^\.?\/?lib\//u, `入口 ${entry} 不在 lib/ 下`);
    assert.ok(existsSync(join(root, entry)), `入口 ${entry} 指向的文件不存在`);
  }
  assert.equal(pkg.scripts.build, undefined, "没有源码树就不该提供 build 脚本");
});

test("不得对 DSH 内核声明 peer 区间（任何区间都会挡住某些版本）", () => {
  // semver 里 prerelease 之间 alpha < beta < rc，所以哪怕写 >=0.2.1-rc.1，
  // 0.2.1-alpha.2 也会被判为不兼容，安装被直接拒绝。宿主本来就提供这些包，
  // 声明区间只会变成一道安装闸门 —— 兼容范围写进 README，不写进清单。
  const kernel = Object.keys(pkg.peerDependencies).filter((name) => name.startsWith("@deepseek-ai/dsh-"));
  assert.deepEqual(kernel, [], `不要声明 DSH 内核 peer：${kernel.join(", ")}`);
});

test("pi-ai 必须是 dependencies 而不是 peer（第二层根因）", () => {
  assert.ok(pkg.dependencies["@earendil-works/pi-ai"], "pi-ai 必须在 dependencies 里");
  assert.equal("dependencies" in pkg && pkg.peerDependencies["@earendil-works/pi-ai"], undefined);
});

test("宿主包的下限必须写成 >=，不能写 ^（^ 会把实测可用的旧版判成「环境太老」）", () => {
  // 实测矩阵：cordis 4.0.4 / schemastery 3.18.4 都能跑（DSH 0.1.7-rc.1），
  // 而 ^4.0.5 / ^3.18.5 的下限高于它们 —— dshmarket 的 compatibility.js 会据此
  // 判 belowMin（「环境太老」），把本来能用的内核劝退。下限只写真正需要的那一版。
  for (const [name, floor] of [["@deepseek-ai/cordis", "4.0.4"], ["@deepseek-ai/schemastery", "3.18.4"]]) {
    const range = pkg.peerDependencies[name];
    assert.equal(range, `>=${floor}`, `${name} 的下限应为 >=${floor}，实际 ${range}`);
  }
});

test("加载前必须预检 schemastery.volatile()，否则老内核只报一句看不懂的 TypeError", () => {
  // 0.1.5-rc.2 的 schemastery 是 3.18.2，缺 .volatile()：裸跑会抛
  // `z.boolean(...).default(...).volatile is not a function`，用户看不出是内核太老。
  // 预检把这句话换成「DSH 0.1.7 起才支持」，所以它必须真的在 bundle 里。
  const bundle = read("lib/index.js");
  assert.ok(bundle.includes("schemasteryHasVolatile"), "lib/index.js 缺少 schemastery 预检");
  assert.match(bundle, /this DSH core is too old/u, "预检必须给出可读的失败原因");
  const guardAt = bundle.indexOf("schemasteryHasVolatile(z)");
  const firstSchemaAt = bundle.indexOf("MAXIMUM_CONTEXT_WINDOW_FIELD = ");
  assert.ok(guardAt !== -1 && firstSchemaAt !== -1 && guardAt < firstSchemaAt, "预检必须在第一个 schema 定义之前执行");
});

test("engines.node 有声明，避免装到不支持的运行时", () => {
  assert.equal(typeof pkg.engines?.node, "string");
});
