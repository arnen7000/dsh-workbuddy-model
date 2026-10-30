# dsh-workbuddy-model

[English](./README.en.md) | 中文

把 WorkBuddy / WorkBuddy AI 桌面 App 里已登录的模型接入 DeepSeek Harness。国内版与国际版各自显示自己的模型分组，各用各自的账号与积分。

## 安装

前置：本机已安装并登录 WorkBuddy 桌面 App（国内版 WorkBuddy 或国际版 WorkBuddy AI 任一）。

**从 npm 装（命令行）**：

```bash
dsh plugin --profile web add dsh-workbuddy-model
```

**从 DSH 插件市场装**：打开**插件市场**，搜索 `workbuddy-model`，点安装。
安装、升级、卸载都在界面里完成，不用记命令。

**从本仓库装**（想固定到某个提交，或某个版本还没发 npm 时）：

```bash
dsh plugin --profile web add github:arnen7000/dsh-workbuddy-model
```

**从本地目录装**（要改代码，或想固定到某个本地快照）：

```bash
# <本插件目录>：仓库所在的本地路径
dsh plugin --profile web add <本插件目录>
```

**升级**：`dsh plugin --profile web add dsh-workbuddy-model@latest`。**重启 dsh 生效。**

核验（末尾不应出现 `is incompatible with dsh ...`）：

```bash
dsh plugin --profile web list
```

> **桌面版**：`desktop` profile 由 App 独占，`dsh plugin --profile desktop add` 会被 CLI 拒绝。
> 用 App 自带的插件页装：侧栏**插件** → **添加插件** → 箭头 → **安装第三方插件**，
> 输入框填 `dsh-workbuddy-model`（npm 包名）或 `file:<本插件目录>`，
> **本地路径必须带 `file:` 前缀**（裸路径会变成 `link:` 软链，而 pnpm 在部分机器上建不出软链、会静默装不上），
> 安装源选**中国大陆镜像源**，装完点**立即启用**。

## 卸载

```bash
dsh plugin --profile web remove dsh-workbuddy-model
```

`remove` 会同时移除 dependencies 与 bundles 登记，无需手动改配置。

**桌面版**：侧栏**插件** → **已安装** → 选中 `dsh-workbuddy-model` → **卸载**（会要求确认）。
更新同样在插件页完成——详情页有**更新**按钮（先删旧包，再从同一来源装回）。

只有在 CLI 不可用、或 profile 已经装坏的情况下，才需要手工处理：退出 App，删掉 `package.json`
里依赖那一行与 `dsh.profile.bundles` 中的 `dsh-workbuddy-model`，再 `pnpm install`。

## 环境要求

| 项 | 要求 | 实测 |
|---|---|---|
| Node | `^22.19.0 \|\| >=24.0.0` | `22.22.2`、`24.21.0` |
| DSH 内核 | `>= 0.2.1-rc.1` | `0.2.1-rc.3` |
| WorkBuddy 桌面 App | 已安装**并登录**（国内版或国际版任一） | 国内版 `5.9.3`、国际版 `5.8.4` |
| Python | **不需要** | 插件不调用 Python |
| 原生编译工具链 | **不需要** | 运行时依赖全是纯 JS，无 `.node` 模块 |
| git | 仅从 GitHub 安装时需要 | pnpm 要 clone 仓库 |
| 操作系统 | 见下节「平台支持」 | 仅 Windows 真机实测 |

`@google/genai` 与 `protobufjs` 带安装脚本（前者是空操作，后者只做版本一致性检查，都不编译），
但 pnpm 默认会拦下未授权的脚本，第一次安装会以 `ERR_PNPM_IGNORED_BUILDS` 结束：

- **桌面版插件页**：直接点**允许这些脚本并重试**
- **命令行**：CLI 会在 profile 的 `pnpm-workspace.yaml` 里写好占位项，把 `set this to true or false`
  改成 `true`，再重跑同一条 `add` 命令：

  ```yaml
  allowBuilds:
    '@google/genai': true
    protobufjs: true
  ```

## 适用范围

**最低要求：DSH 内核 `0.1.7`**（其 `@deepseek-ai/schemastery` 为 `3.18.4`）。
更老的内核**不支持**：`0.1.5-rc.2` 实测会在加载阶段失败，因为它带的 `schemastery` 没有 `.volatile()`。
`0.1.2` 起会直接报出原因（`this DSH core is too old …`），不再是那句看不出所以然的
`z.boolean(...).default(...).volatile is not a function`。

**已实测**——下面这些环境跑过真实对话：

| 组件 | 版本 |
|---|---|
| DSH 内核 | `0.2.1-rc.3`（桌面版）、`0.2.1-alpha.2`、`0.2.2-alpha.2`、`0.1.7-rc.1` |
| WorkBuddy（国内版） | `5.9.3` |
| WorkBuddy AI（国际版） | `5.8.4` |
| 操作系统 | Windows x64 |

**不对 DSH 内核声明版本区间**：`package.json` 里没有 `@deepseek-ai/dsh-*` 的 `peerDependencies`，
所以任何内核版本都能装上，不会被宿主以「不兼容」为由拒绝。上表之外、但 `0.1.7` 以上的环境
**可以装，但不保证好用**。

App 升级同理：插件复用 App 的登录状态与版本号，App 变了、上游改了校验规则，就可能失效。

## 平台支持

| 平台 | 状态 | 凭据从哪来 |
|---|---|---|
| Windows x64 | **已实测** | `%LOCALAPPDATA%` / `%APPDATA%` 下的 `CodeBuddyExtension/.../auth`，解密时定位 `WorkBuddy.exe` |
| macOS | **未实测**（分支完整） | `~/Library/Application Support/CodeBuddyExtension/...`；版本号从 `WorkBuddy.app` 的 `Info.plist` 与内置 CLI 读取 |
| Linux | **未实测**（分支完整） | `$XDG_CONFIG_HOME` 与 `$XDG_DATA_HOME` 两处都探；WSL 额外探挂载的 Windows 目录 |

macOS / Linux 按各自平台的规范实现，但**没有在真机上跑过**。真机上仍可能遇到的问题：

- 解密凭据需要一个 Electron 二进制；非 Windows 平台若自动发现失败，用 `WORKBUDDY_ELECTRON_BIN`
  （国际版 `WORKBUDDY_AI_ELECTRON_BIN`）直接指向 App 的可执行文件
- macOS / Linux 上 WorkBuddy 桌面 App 是否存在、是否写同样的 auth 文件，未验证
- 路径分隔符与大小写敏感性差异，只能在对应平台上跑一次才能确认

## 已知限制

- 本质是把 DSH 伪装成 WorkBuddy 官方客户端调用其接口，上游有渠道校验机制，随时可能再次失效
- 本仓库只发预构建产物 `lib/`，没有可重建的源码树——`lib/` 就是唯一实现来源

## 来源

基于 npm 包 `dsh-workbuddy-connect@0.7.9` 的构建产物修改，主要改动是**适配 DSH 桌面版**。

## 许可

MIT，版权归原作者。见 [LICENSE](./LICENSE) 与 [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt)。
