// 平台矩阵：三个平台下凭据/App 路径的解析结果，以及未知平台必须"什么都不猜"。
// 这些断言在 Windows 上跑，靠改写 process.platform 模拟 darwin / linux。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  C as VARIANTS,
  S as CN_VARIANT,
  x as AI_VARIANT,
  h as defaultDesktopAuthCandidates,
  _ as desktopAuthCandidatesFor,
  g as defaultDesktopAuthPath,
} from "../lib/host-heartbeat-SJaZ33tR.js";

const PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

/**
 * 分隔符无关的路径比较。
 *
 * 本文件在哪个平台上跑，`node:path` 就固定用哪个平台的分隔符——在 Windows 上
 * 模拟 linux 时，`join()` 依然产出反斜杠。所以断言只能比较"结构"，不能比较
 * 字面分隔符；真实分隔符要靠在对应平台上跑一次才算验证过。
 */
const norm = (path) => path.replace(/\\/gu, "/");

/** 在指定平台上执行，并临时改写相关环境变量。 */
function onPlatform(platform, env, run) {
  const saved = new Map();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(process, "platform", PLATFORM);
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("darwin：只探一个 macOS 位置，且不探 XDG", () => {
  const paths = onPlatform("darwin", { XDG_CONFIG_HOME: "/tmp/xdg" }, () => defaultDesktopAuthCandidates());
  assert.equal(paths.length, 1);
  assert.match(paths[0], /Library[\\/]Application Support/);
  assert.doesNotMatch(paths[0], /\.config/);
});

test("win32：Local 与 Roaming 各探一次", () => {
  const paths = onPlatform("win32", {}, () => defaultDesktopAuthCandidates());
  assert.equal(paths.length, 2);
  assert.match(paths[0], /AppData[\\/]Local/);
  assert.match(paths[1], /AppData[\\/]Roaming/);
});

test("linux：默认探 XDG config 与 data 两处", () => {
  const paths = onPlatform("linux", { XDG_CONFIG_HOME: undefined, XDG_DATA_HOME: undefined, WSL_DISTRO_NAME: undefined, WSL_INTEROP: undefined }, () =>
    defaultDesktopAuthCandidates(),
  );
  assert.equal(paths.length, 2);
  assert.match(paths[0], /\.config/);
  assert.match(paths[1], /\.local[\\/]share/);
});

test("linux：尊重 XDG_CONFIG_HOME / XDG_DATA_HOME", () => {
  const paths = onPlatform("linux", { XDG_CONFIG_HOME: "/opt/cfg", XDG_DATA_HOME: "/opt/data", WSL_DISTRO_NAME: undefined }, () =>
    defaultDesktopAuthCandidates(),
  );
  assert.ok(paths.some((p) => norm(p).startsWith("/opt/cfg")), paths.join(","));
  assert.ok(paths.some((p) => norm(p).startsWith("/opt/data")), paths.join(","));
});

test("linux：WSL 下额外探挂载的 Windows 配置目录", () => {
  const paths = onPlatform("linux", { WSL_DISTRO_NAME: "Ubuntu", XDG_CONFIG_HOME: undefined, XDG_DATA_HOME: undefined }, () =>
    defaultDesktopAuthCandidates(),
  );
  assert.ok(paths.length > 2, `WSL 应额外加入挂载路径，实际 ${paths.length}`);
  assert.ok(paths.some((p) => norm(p).includes("/mnt/")), paths.join(","));
});

test("未知平台：返回空列表，绝不猜路径", () => {
  const paths = onPlatform("freebsd", {}, () => defaultDesktopAuthCandidates());
  assert.deepEqual(paths, []);
});

test("每个平台下每个变体的路径都以该变体自己的文件名结尾", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    onPlatform(platform, { XDG_CONFIG_HOME: undefined, XDG_DATA_HOME: undefined, WSL_DISTRO_NAME: undefined }, () => {
      for (const variant of VARIANTS) {
        const paths = desktopAuthCandidatesFor(variant);
        assert.ok(paths.length > 0, `${platform}/${variant.id} 应有候选路径`);
        for (const path of paths) {
          assert.ok(
            path.endsWith(variant.desktopFilename),
            `${platform}/${variant.id} 期望以 ${variant.desktopFilename} 结尾，实际 ${path}`,
          );
        }
      }
    });
  }
});

test("两个变体的文件名互不相同（否则会互相读错凭据）", () => {
  assert.notEqual(CN_VARIANT.desktopFilename, AI_VARIANT.desktopFilename);
  assert.notEqual(CN_VARIANT.ownFilename, AI_VARIANT.ownFilename);
  assert.notEqual(CN_VARIANT.catalogFilename, AI_VARIANT.catalogFilename);
});

test("未知平台的默认路径是 undefined，而不是空字符串", () => {
  const path = onPlatform("freebsd", {}, () => defaultDesktopAuthPath(CN_VARIANT));
  assert.equal(path, undefined);
});
