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
但 pnpm 默认会拦下未授权的脚本——桌面版 profile 的 `pnpm-workspace.yaml` 要把这两个加进 `allowBuilds`，
否则安装会直接失败（`ERR_PNPM_IGNORED_BUILDS`）。插件页遇到这个报错时，点**允许这些脚本并重试**即可。

## 版本兼容

**已验证**（只声明实际测过的环境）：

| 组件 | 版本 |
|---|---|
| DSH 桌面版内核 | `0.2.1-rc.3` |
| WorkBuddy（国内版） | `5.9.3` |
| WorkBuddy AI（国际版） | `5.8.4` |

peer 写成 `>=0.2.1-rc.1`（**不设上限**），所以 DSH 内核或 WorkBuddy App 升级后**仍然可以安装**，
不会被宿主拒绝加载。但只有上表这些环境实测过——其他版本能装，**不保证稳定可用**。
`0.2.0` 及更早的内核会被拒绝（插件用到 `0.2.1` 才有的 SettingsForms）。

App 升级同理：插件复用 App 的登录状态与版本号，App 变了、上游改了校验规则，就可能失效。

## 平台支持

| 平台 | 状态 | 凭据从哪来 |
|---|---|---|
| Windows x64 | **已实测** | `%LOCALAPPDATA%` / `%APPDATA%` 下的 `CodeBuddyExtension/.../auth`，解密时定位 `WorkBuddy.exe` |
| macOS | **未实测**（代码分支完整） | `~/Library/Application Support/CodeBuddyExtension/...`；版本号从 `WorkBuddy.app` 的 `Info.plist` 与内置 CLI 读取 |
| Linux | **未实测**（代码分支完整） | `$XDG_CONFIG_HOME` 与 `$XDG_DATA_HOME` 两处都探；WSL 额外探挂载的 Windows 目录 |

macOS / Linux 的路径逻辑有**模拟平台的单元测试**覆盖（`test/platform.test.mjs`，断言三个平台各自探哪些位置、
未知平台返回空列表而不猜路径），但**没有在真机上跑过**。真机上仍可能遇到的问题：

- 解密凭据需要一个 Electron 二进制；非 Windows 平台若自动发现失败，用 `WORKBUDDY_ELECTRON_BIN`
  （国际版 `WORKBUDDY_AI_ELECTRON_BIN`）直接指向 App 的可执行文件
- macOS / Linux 上 WorkBuddy 桌面 App 是否存在、是否写同样的 auth 文件，未验证
- 路径分隔符：模拟测试只能验证"结构"，真实分隔符要靠在对应平台上跑一次

## 测试

```bash
node tools/run-tests.mjs                      # 离线契约测试（60 项，不需要网络与凭据）
node tools/check-installed.mjs                # 源码与已安装副本是否一致
node tools/mutate-tests.cjs                   # 变异测试：证明断言不是恒真
WORKBUDDY_SMOKE=1 node tools/smoke-live.mjs   # 联网冒烟（真打上游，需本机已登录）
```

四层各管一件事：

| 层 | 管什么 | 什么时候跑 |
|---|---|---|
| 契约测试 | 请求体形状、UA 的 header 安全、错误分类、路由字面量、清单一致性、平台路径 | 每次改动 |
| 安装态检查 | 源码与已安装副本是否一致（`file:` 是**拷贝**，不同步会静默跑旧代码） | 改完要生效前 |
| 变异测试 | 断言能不能真的失败（9 个故意改坏的分支必须全部被捕获） | 改测试或改护栏时 |
| 联网冒烟 | 上游规则是否还成立——国内那条 `400/11128` 只有真端点能验证 | 发版前、App 升级后 |

**没覆盖到的**：DSH 宿主里的实际加载、面板 UI、SSE 流式转发到浏览器这一段。
这些只能靠装进 App 里手动验一次。

## 已知限制

- 本质是把 DSH 伪装成 WorkBuddy 官方客户端调用其接口，上游有渠道校验机制，随时可能再次失效
- 本仓库只发预构建产物 `lib/`，没有可重建的源码树——`lib/` 就是唯一实现来源

## 来源

基于 npm 包 `dsh-workbuddy-connect@0.7.9` 的构建产物修改，主要改动是**适配 DSH 桌面版**。

## 许可

MIT，版权归原作者。见 [LICENSE](./LICENSE) 与 [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt)。
