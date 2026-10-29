# dsh-workbuddy-model

Brings the models available in your signed-in WorkBuddy / WorkBuddy AI desktop app into DeepSeek Harness.
The CN and international products each show their own model group, using their own account and credits.

## Install

Prerequisite: the WorkBuddy desktop app is installed and signed in (either WorkBuddy or WorkBuddy AI).

**From npm (CLI)**:

```bash
dsh plugin --profile web add dsh-workbuddy-model
```

**From the DSH plugin marketplace**: open the **Plugin Marketplace**, search `workbuddy-model`, click install.

**From this repository** (pin a commit, or when a version is not on npm yet):

```bash
dsh plugin --profile web add github:arnen7000/dsh-workbuddy-model
```

**From a local directory** (when you want to change the code):

```bash
# <plugin dir>: the local path of this repository
dsh plugin --profile web add <plugin dir>
```

**Upgrade**: `dsh plugin --profile web add dsh-workbuddy-model@latest`. **Restart dsh to take effect.**

Verify (no `is incompatible with dsh ...` in the output):

```bash
dsh plugin --profile web list
```

> **Desktop app**: the `desktop` profile is owned by the app, so `dsh plugin --profile desktop add` is
> refused. Use the app's plugin page instead: **Plugins** → **Add plugin** → **Install third-party plugin**,
> and enter `dsh-workbuddy-model` (npm name) or `file:<plugin dir>`. A local path **must** carry the
> `file:` prefix — a bare path becomes a `link:` dependency, which pnpm cannot materialise on some
> machines and then installs nothing, silently. Pick the **mainland China mirror** as the source.

## Uninstall

```bash
dsh plugin --profile web remove dsh-workbuddy-model
```

`remove` clears both the dependency and the bundle entry; no manual config edit needed.

**Desktop app**: sidebar **Plugins** → **Installed** → select `dsh-workbuddy-model` → **Uninstall** (it asks for confirmation).
Updating works the same way: the detail page has an **Update** button (it removes the old package, then reinstalls from the same source).

Editing files by hand is only a fallback for a broken profile: quit the app, drop the dependency line and the
`dsh-workbuddy-model` entry from `dsh.profile.bundles`, then run `pnpm install`.

## Requirements

| Item | Requirement | Measured |
|---|---|---|
| Node | `^22.19.0 \|\| >=24.0.0` | `22.22.2`, `24.21.0` |
| DSH core | `>= 0.2.1-rc.1` | `0.2.1-rc.3` |
| WorkBuddy desktop app | installed **and signed in** (CN or international) | CN `5.9.3`, international `5.8.4` |
| Python | **not required** | the plugin never invokes Python |
| Native toolchain | **not required** | runtime deps are pure JS, no `.node` modules |
| git | only for installing from GitHub | pnpm clones the repository |
| OS | see "Platform support" below | only Windows verified on real hardware |

`@google/genai` and `protobufjs` ship install scripts (a no-op and a version-consistency check — neither compiles),
but pnpm blocks unauthorised scripts by default: add both to `allowBuilds` in the desktop profile's
`pnpm-workspace.yaml`, or installation fails with `ERR_PNPM_IGNORED_BUILDS`. The plugin page offers
**allow these scripts and retry** for exactly this error.

## Version compatibility

**Verified** (only environments actually tested):

| Component | Version |
|---|---|
| DSH desktop core | `0.2.1-rc.3` |
| WorkBuddy (CN) | `5.9.3` |
| WorkBuddy AI (international) | `5.8.4` |

Peers are declared as `>=0.2.1-rc.1` (**no upper bound**), so a DSH core or WorkBuddy app upgrade
**still installs** — the host will not refuse to load the plugin. Only the environments above were
measured; other versions install but are **not guaranteed to be stable**. Cores at `0.2.0` or older are
rejected (the plugin relies on SettingsForms, which only exists from `0.2.1`).

The same applies to the WorkBuddy app: the plugin reuses its sign-in and version, so upstream changes
in validation can break it.

## Platform support

| Platform | Status | Where the credential comes from |
|---|---|---|
| Windows x64 | **verified** | `CodeBuddyExtension/.../auth` under `%LOCALAPPDATA%` / `%APPDATA%`; decryption locates `WorkBuddy.exe` |
| macOS | **untested** (code paths complete) | `~/Library/Application Support/CodeBuddyExtension/...`; version read from `WorkBuddy.app`'s `Info.plist` and the bundled CLI |
| Linux | **untested** (code paths complete) | both `$XDG_CONFIG_HOME` and `$XDG_DATA_HOME`; WSL additionally probes the mounted Windows profile |

The macOS / Linux path logic is covered by **platform-simulated unit tests** (`test/platform.test.mjs`, asserting
which locations each platform probes and that unknown platforms return an empty list rather than guessing), but
**has never run on real hardware**. What can still bite you there:

- decrypting the credential needs an Electron binary; if auto-discovery fails, point `WORKBUDDY_ELECTRON_BIN`
  (`WORKBUDDY_AI_ELECTRON_BIN` for the international app) straight at the app executable
- whether the WorkBuddy desktop app even exists on macOS / Linux and writes the same auth file is unverified
- path separators: the simulated tests only verify structure; real separators need a run on the real platform

## Testing

```bash
node tools/run-tests.mjs                      # offline contract tests (60 assertions, no network or credential)
node tools/check-installed.mjs                # source vs installed copy
node tools/mutate-tests.cjs                   # mutation tests: prove the assertions can fail
WORKBUDDY_SMOKE=1 node tools/smoke-live.mjs   # live smoke test (real upstream, needs a signed-in app)
```

Four layers, each with one job:

| Layer | Covers | When |
|---|---|---|
| Contract tests | request body shape, UA header safety, error classification, route literals, manifest consistency, platform paths | every change |
| Install check | source vs installed copy (`file:` installs are **copies**; a missed sync silently runs stale code) | before anything takes effect |
| Mutation tests | whether assertions can actually fail (all 4 deliberately broken branches must be caught) | when touching tests or guards |
| Live smoke | whether the upstream rules still hold — the CN `400/11128` rule is only observable against the real endpoint | before a release, after an app upgrade |

**Not covered**: loading inside the DSH host, the settings panel UI, and SSE relay to the browser.
Those still need one manual run inside the app.

## Known limitations

- This works by posing as the official WorkBuddy client; the upstream runs channel checks and may break it again at any time
- This repository ships the prebuilt `lib/` only — there is no source tree to rebuild, `lib/` is the single source of truth

## Provenance

Built from the published artifacts of `dsh-workbuddy-connect@0.7.9`, with changes aimed at **running on the DSH desktop app**.

## License

MIT, copyright the original author. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt).
