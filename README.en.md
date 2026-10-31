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

> **The first install may ask you to approve install scripts** — that is pnpm's default safety gate,
> not a failed install. This plugin's dependency `@earendil-works/pi-ai` pulls in `@google/genai` and
> `protobufjs`, and both declare an install script. pnpm does not run those by default, so it hands
> the decision to you. Both scripts are no-ops or print one line of warning: `protobufjs` only checks
> the version prefix its dependents declare (and writes a `WARN` to stderr if it looks off), and
> `@google/genai`'s `preinstall` is a plain `echo`. **Neither writes files, uses the network, or
> compiles anything.** Click **allow these scripts and retry**; the approval is stored in the current
> profile and you will not be asked again.

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
but pnpm blocks unauthorised scripts by default, so the first install ends with `ERR_PNPM_IGNORED_BUILDS`:

- **Desktop plugin page**: click **allow these scripts and retry**
- **Command line**: the CLI writes placeholder entries into the profile's `pnpm-workspace.yaml`; change
  `set this to true or false` to `true` and re-run the same `add` command:

  ```yaml
  allowBuilds:
    '@google/genai': true
    protobufjs: true
  ```

## Scope

**Minimum: DSH core `0.1.7`** (which ships `@deepseek-ai/schemastery` `3.18.4`).
Older cores are **not supported**: `0.1.5-rc.2` fails at load time because its `schemastery` has no
`.volatile()`. From `0.1.2` the plugin says so directly (`this DSH core is too old …`) instead of dying
with `z.boolean(...).default(...).volatile is not a function`.

**Verified** — the environments below have run a real conversation:

| Component | Version |
|---|---|
| DSH core | `0.2.1-rc.3` (desktop), `0.2.1-alpha.2`, `0.2.2-alpha.2`, `0.1.7-rc.1` |
| WorkBuddy (CN) | `5.9.3` |
| WorkBuddy AI (international) | `5.8.4` |
| OS | Windows x64 |

**No version range is declared for any host package**: `peerDependencies` carries no `@deepseek-ai/*`
entry — not the core, not `cordis`, not `schemastery`. The host provides all of them, and a declared
range is only ever read as evidence that the environment is too old: hosts ship prereleases such as
`0.2.1-alpha.2` and `3.18.5-alpha.1`, and a prerelease falls into no ordinary range, so every range
misfires. Every core version therefore installs; anything outside the table but at `0.1.7` or newer
**installs but is not guaranteed to work**.

The same applies to the WorkBuddy app: the plugin reuses its sign-in and version, so upstream changes
in validation can break it.

## Platform support

| Platform | Status | Where the credential comes from |
|---|---|---|
| Windows x64 | **verified** | `CodeBuddyExtension/.../auth` under `%LOCALAPPDATA%` / `%APPDATA%`; decryption locates `WorkBuddy.exe` |
| macOS | **untested** (code paths complete) | `~/Library/Application Support/CodeBuddyExtension/...`; version read from `WorkBuddy.app`'s `Info.plist` and the bundled CLI |
| Linux | **untested** (code paths complete) | both `$XDG_CONFIG_HOME` and `$XDG_DATA_HOME`; WSL additionally probes the mounted Windows profile |

macOS / Linux follow each platform's own conventions, but **have never run on real hardware**.
What can still bite you there:

- decrypting the credential needs an Electron binary; if auto-discovery fails, point `WORKBUDDY_ELECTRON_BIN`
  (`WORKBUDDY_AI_ELECTRON_BIN` for the international app) straight at the app executable
- whether the WorkBuddy desktop app even exists on macOS / Linux and writes the same auth file is unverified
- path separators and case sensitivity differ; only a run on the real platform settles it

## Known limitations

- This works by posing as the official WorkBuddy client; the upstream runs channel checks and may break it again at any time
- The first install asks pnpm to approve the install scripts of `@google/genai` / `protobufjs` (both no-ops or warning-only); approve once — see the **Install** section above
- This repository ships the prebuilt `lib/` only — there is no source tree to rebuild, `lib/` is the single source of truth

## Provenance

Built from the published artifacts of `dsh-workbuddy-connect@0.7.9`, with changes aimed at **running on the DSH desktop app**.

## License

MIT, copyright the original author. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt).
