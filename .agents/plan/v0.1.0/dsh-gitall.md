# dsh-gitall v0.1.0：为 forge 面板接入 GitLab / Gitea / Gitee

> 本文档是本次编码的真源：确定后直接照着它编码；节点编号在编码期间保持不变（提交信息用它指明完成到哪）。
> 状态：`- [ ]` 未完成 / `- [x]` 已完成。一个最小节点完成 = 其下全部要点已勾选，且「完成判据」成立。

## 1 需求与范围

**需求**：做一个**单包、host-only** 的 DSH 插件 `dsh-gitall`，向官方 `ctx.forge` 注册表注册三个 provider（`gitlab` / `gitea` / `gitee`），让现有的变更请求面板、工作树与右栏 UI 在 GitLab、Gitea/Forgejo、Gitee 仓库上表现得和 GitHub 一样；数据来源是各平台官方 CLI（`glab` / `gt` / `gitee`），凭据完全留在 CLI 自己的配置里。同时附带一个 binding 模块，让 agent 执行这些 CLI 时输出的 MR/PR URL 自动绑定到会话，行为对齐 `gh pr view`。

**不做的事**：

- **不改 dsh 源码**，不新增 client / UI 包；面板文案差异用 `readiness.message` 弥补。
- v1 不实现评审读写：`readReview`、`writeReview`、`submitReview`、`viewedFiles`/`setViewed`、`commits`/`compare`、`rerunChecks`、`requestReviews`/`reviewerCandidates`、`updateBranch`、`fetchChecks`（全部为可选能力，缺省即降级）。
- 不做 Gitee 的 checks：Gitee OpenAPI v5 没有对外的 CI/门禁接口，`checks` 恒为 `[]`。
- 不替换官方 `forge-github`；GitHub 仓库仍由它服务。
- 不做「只给编号不给 URL」的绑定解析（`glab mr view 42` 的 42 不会被单独查询），binding 只从命令输出里的 URL 提取。
- 不做 webhook、不做缓存落盘（沿用官方轮询与本包内存状态）。
- 不做设置页 / 图标 / locale（无 client 包）。

**关键假设**（与事实不符时先改本节再动代码）：

- 三个 CLI 都有 `api` 透传：`glab api`、`gt api`、`gitee api`。结构化读取一律以 REST JSON 为准，避免依赖各 CLI 自身 `--json` 字段的稳定性。
- `gt` 是 Gitea 官方 CLI（1.0.0 起取代已归档的 `tea`），要求 Gitea 28+；Gitea 没有 draft 状态，`markReady` 只能返回 `failed`。
- Gitee 的 PR 合并可能是多步流程；v1 只发一次合并请求，失败原因原样透传。
- 本机当前**没有安装** `glab` / `gt` / `gitee`，端到端验证用假 CLI 脚本 + 录制 JSON，真机冒烟留作可选步骤。
- 本目录已 `git init -b main`（空仓库，无提交），`.gitignore` 已忽略 `node_modules/`、`lib/`、`coverage/`、`.dsh-ops/`；首个提交在 `main` 上完成（新仓库、无提交，不违反主分支保护）。
- 插件以 `dsh.bundle.patch` 形式安装：`package.json` 的 `dsh.bundle.patch` 指向自带 `cordis.patch.yml`，profile 用 `dsh plugin --profile <name> add dsh-gitall` 安装。

## 2 代码结构

```text
dsh-gitall/
├── package.json                 # 包清单：dsh.bundle.patch、exports、peer/deps
├── tsconfig.json                # 类型检查（含 test）
├── tsconfig.build.json          # 只编译 src → lib
├── cordis.patch.yml             # 把本插件 insert 进 profile
├── .gitignore                   # node_modules / lib / coverage
├── README.md / README.zh.md     # 中英双语：能力边界、安装、配置、已知差异
├── src/
│   ├── index.ts                 # 插件入口：apply() 注册三个 provider 并启动 binding
│   ├── config.ts                # schemastery Config + resolveConfig() 默认值/校验
│   ├── core/
│   │   ├── cli.ts               # CliRunner：剥 env、超时、输出上限、错误类型
│   │   ├── json.ts              # JSON 取值助手与错误→ForgeFailure 映射
│   │   ├── snapshot.ts          # 统一构造 ChangeRequestSnapshot（填充可选区块默认值）
│   │   └── patch.ts             # 由逐文件 diff 合成带 a//b/ 头的统一补丁
│   ├── providers/
│   │   ├── gitlab/
│   │   │   ├── urls.ts          # remote / MR URL 解析与反构
│   │   │   ├── read.ts          # fetch / findByHead / diff / fileText / readiness
│   │   │   ├── write.ts         # merge / markReady
│   │   │   └── provider.ts      # GitLabProvider 组合上述方法
│   │   ├── gitea/…              # 同上四文件
│   │   └── gitee/…              # 同上四文件
│   └── binding/
│       ├── commands.ts          # 识别 glab/gt/gitee 命令、从输出提取 URL
│       └── service.ts           # 监听 tools/result，追加 plugin:forge-session/binding 记录
└── test/
    ├── core/{cli,json,snapshot,patch}.test.ts
    ├── config.test.ts
    ├── providers/{gitlab,gitea,gitee}.test.ts
    ├── binding/{commands,service}.test.ts
    └── integration/providers.test.ts
```

| 文件 | 新增/修改 | 职责 |
| --- | --- | --- |
| `package.json` | 新增 | 包名 `dsh-gitall`、`dsh.bundle.patch`、`exports`、peerDeps（`@deepseek-ai/cordis` ~4.1.0、`@deepseek-ai/dsh-experimental-forge` 0.2.2-rc.2、`@deepseek-ai/dsh-subprocess` 0.2.2-rc.2、`@deepseek-ai/dsh-session` 0.2.2-rc.2、`@deepseek-ai/dsh-experimental-forge-session` 0.2.2-rc.2）与 deps（`execa`、`schemastery`） |
| `cordis.patch.yml` | 新增 | `- insert: [{ id: gitall, name: dsh-gitall }]`，不写死 config |
| `src/index.ts` | 新增 | `export const name = 'gitall'`、`inject = ['forge']`、`apply()`：解析配置 → 三次 `ctx.forge.register()` → 可选启动 binding |
| `src/config.ts` | 新增 | `Config`（schemastery）与 `resolveConfig()`；校验 command 非空、hosts 合法、数值上限 |
| `src/core/cli.ts` | 新增 | 用 `execa` + `scrubbedParentEnv()` 跑 CLI；禁用分页/颜色/更新提示；超时与输出上限转成专门错误 |
| `src/core/json.ts` | 新增 | `parseJson`/`asRecord`/`text`/`firstLine`，以及把 runner 异常与 `unauthenticated` 症状映射成 `ForgeFailure` |
| `src/core/snapshot.ts` | 新增 | `snapshotOf()`：把各平台字段收口成 `ChangeRequestSnapshot`，评审/讨论/视图等未实现区块填默认值；`checksRollupOf()` |
| `src/core/patch.ts` | 新增 | `unifiedPatch()`：把 `{oldPath,newPath,body}` 列表拼成 `diff --git / --- / +++ / @@` 形态，新删文件用 `/dev/null` |
| `src/providers/*/urls.ts` | 新增 | 远端（ssh/https/端口）→ `ForgeRepository`；变更请求 URL ↔ `ChangeRequestRef` |
| `src/providers/*/read.ts` | 新增 | `fetch` / `findByHead` / `diff` / `fileText` / `readiness` 的具体命令与 JSON 映射 |
| `src/providers/*/write.ts` | 新增 | `merge` / `markReady` 命令与失败归一 |
| `src/providers/*/provider.ts` | 新增 | `class XProvider implements ForgeProvider`，组合 `urls`/`read`/`write` |
| `src/binding/commands.ts` | 新增 | `cliOf(command)`（含 `glab`/`gt`/`gitee` 字面量判断）、`changeRequestUrlsIn(text)` |
| `src/binding/service.ts` | 新增 | `ctx.inject(['tools'])` 后监听 `tools/result`，URL 经 `ctx.forge.changeRequestFromUrl()` 过滤后追加记录 |
| `test/**` | 新增 | 各模块单测 + 假 CLI 集成测试 |

**关键接口与数据流**：

```text
panel(host) ──repositoryFromRemote(remote)──▶ provider 解析 host/owner/name
    │                                              │
    └─ fetch(refs) ──▶ cli(['api', ...]) ──▶ REST JSON ──▶ snapshotOf() ──▶ 面板轮询
bash 工具执行 ──tools/result──▶ binding 提取 URL ──changeRequestFromUrl──▶ 追加 binding 记录
                                                         └─▶ forge-session projection ──▶ 面板显示
```

各平台数据来源（实施时按此写命令，标注 † 的端点需以真机或官方文档再核对一次）：

| 平台 | 快照 | diff | 文件文本 | 合并 | 就绪探测 |
| --- | --- | --- | --- | --- | --- |
| gitlab | `glab api --hostname <host> projects/:fullpath/merge_requests/<iid>` | `glab api …/merge_requests/<iid>/diffs` | `glab api …/repository/files/<urlencoded path>/raw?ref=<sha>` | `glab mr merge <iid> --sha <sha> --yes [--squash\|--rebase]` | `glab auth status --hostname <host>` |
| gitea | `gt api /repos/<o>/<r>/pulls/<n>` | `gt api /repos/<o>/<r>/pulls/<n>.diff` | `gt api /repos/<o>/<r>/raw/<path>?ref=<sha>` † | `gt api -X POST /repos/<o>/<r>/pulls/<n>/merge -F head_commit_id=<sha> -f Do=<method>` | `gt auth status` |
| gitee | `gitee api /repos/<o>/<r>/pulls/<n>` | `gitee api /repos/<o>/<r>/pulls/<n>/files` † | `gitee api /repos/<o>/<r>/contents/<path>?ref=<sha>` † | `gitee api -X POST /repos/<o>/<r>/pulls/<n>/merge -f merge_method=<method>` † | `gitee auth status` |

**冻结的签名**（并行 Agent 按此写码，不得自行改动）：

```ts
// src/core/cli.ts
export interface CliOutput { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
export type CliRunner = (args: readonly string[], signal: AbortSignal, input?: string) => Promise<CliOutput>
export interface CliLimits { readonly timeoutMs: number; readonly maxOutputBytes: number }
export class CliUnavailableError extends Error {}
export class CliTimeoutError extends Error {}
export class CliOutputLimitError extends Error {}
export function createCliRunner(command: string, limits: CliLimits): CliRunner

// src/core/json.ts
export function parseJson(text: string): unknown | undefined
export function asRecord(value: unknown): Record<string, unknown> | undefined
export function text(value: unknown): string | undefined
export function firstLine(value: string): string | null
export function failureOf(error: unknown): ForgeFailure

// src/core/snapshot.ts
export interface SnapshotFields {
  readonly url: string
  readonly title: string
  readonly state: ChangeRequestState
  readonly draft: boolean
  readonly author: string | null
  readonly headBranch: string
  readonly headSha: string
  readonly baseBranch: string
  readonly baseSha?: string
  readonly additions: number
  readonly deletions: number
  readonly mergeability: Mergeability
  readonly mergeReady: boolean
  readonly mergeMethods: readonly MergeMethod[]
  readonly checks: readonly ChangeRequestCheck[]
  readonly updatedAt: string
  readonly closedAt: string | null
}
export function snapshotOf(ref: ChangeRequestRef, fields: SnapshotFields): ChangeRequestSnapshot
export function checksRollupOf(checks: readonly ChangeRequestCheck[]): ChecksRollup

// src/core/patch.ts
export interface FileDiff {
  readonly oldPath: string
  readonly newPath: string
  readonly body: string
  readonly newFile?: boolean
  readonly deletedFile?: boolean
}
export function unifiedPatch(files: readonly FileDiff[]): string

// src/config.ts
export interface ForgeSettings { readonly command: string; readonly hosts: readonly string[] }
export interface Config {
  gitlab?: Partial<ForgeSettings>
  gitea?: Partial<ForgeSettings>
  gitee?: Partial<ForgeSettings>
  timeoutMs?: number
  maxOutputBytes?: number
  binding?: boolean
}
export interface ResolvedConfig {
  readonly gitlab: ForgeSettings
  readonly gitea: ForgeSettings
  readonly gitee: ForgeSettings
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly binding: boolean
}
export function resolveConfig(config: Config): ResolvedConfig

// src/providers/*/provider.ts
export class GitLabProvider implements ForgeProvider { constructor(runner: CliRunner, settings: ForgeSettings) }
export class GiteaProvider implements ForgeProvider { constructor(runner: CliRunner, settings: ForgeSettings) }
export class GiteeProvider implements ForgeProvider { constructor(runner: CliRunner, settings: ForgeSettings) }

// src/binding/service.ts
export function startBinding(ctx: Context): void
```

**默认值**（`resolveConfig` 冻结）：

| 键 | 默认 |
| --- | --- |
| `gitlab.command` / `gitea.command` / `gitee.command` | `glab` / `gt` / `gitee` |
| `gitlab.hosts` | `['gitlab.com']` |
| `gitea.hosts` | `[]`（自建 Gitea 必须显式配置，否则该 provider 不服务任何仓库） |
| `gitee.hosts` | `['gitee.com']` |
| `timeoutMs` / `maxOutputBytes` / `binding` | `30000` / `8388608` / `true` |

**每平台字段映射要点**（写 `read.ts` 时照此实现）：

- `state`：GitLab `state` + `merged_at`；Gitea `state` + `merged`；Gitee `state` + `merged_at`。
- `draft`：GitLab `draft`；Gitea `draft`（无则按标题 `WIP:` 前缀判）；Gitee `draft`/标题 `WIP` 前缀。
- `mergeReady`：`open && !draft && mergeable` 且当前用户有合并权（GitLab `user.can_merge`、Gitea `mergeable`、Gitee `mergeable`）。
- `mergeMethods`：GitLab `['merge','squash','rebase']`；Gitea `['merge','squash','rebase']`；Gitee `['merge','squash']`。
- `checks`：GitLab `head_pipeline`（单条，`rerun: null`）；Gitea `GET …/commits/<sha>/statuses` 逐条；Gitee `[]`。
- `additions`/`deletions`：Gitea 直接用；GitLab/Gitee 由 `/diffs` 或 `/files` 的 `+`/`-` 行求和。
- 未实现区块一律走 `snapshotOf()` 的默认：`branchUpdates: []`、`reviewDecision: 'none'`、`reviewers: []`、`canRequestReviews: false`、`canRerunChecks: false`、`unresolvedThreads: 0`、`closingIssues: []`。

## 3 开发进度

### 3.1 包骨架与 core 工具

#### 3.1.1 脚手架与构建链

- [ ] 新建 `package.json`（`name: "dsh-gitall"`、`version: "0.1.0"`、`type: "module"`、`main: "lib/index.js"`、`exports`、`files: ["lib","cordis.patch.yml","README*.md"]`、`dsh.bundle.patch: "./cordis.patch.yml"`、peer/deps 如 §2）。
- [ ] 新建 `tsconfig.json`、`tsconfig.build.json`、`.gitignore`、`cordis.patch.yml`、`src/index.ts` 占位（导出 `apply()` 空实现）。
- [ ] `pnpm install` 成功，`pnpm build` 产出 `lib/index.js`。
- **完成判据**：`pnpm install && pnpm build` 通过。

#### 3.1.2 CLI runner

- [ ] `src/core/cli.ts`：`execa` 启动 `command`，`extendEnv: false` + `scrubbedParentEnv()`，附 `GH_PAGER=''` 类禁用项按平台补（`NO_COLOR=1`、`CLICOLOR='0'`、`GITEA_CLI_ERROR_FORMAT='json'` 可选）。
- [ ] 超时、取消、`maxBuffer`、进程无法启动分别抛 `CliTimeoutError` / 透传 `signal.reason` / `CliOutputLimitError` / `CliUnavailableError`。
- [ ] `test/core/cli.test.ts`：用 `node -e` 或临时脚本覆盖正常退出、非零退出、超时、输出超限、命令不存在。
- **完成判据**：`pnpm vitest run test/core/cli.test.ts` 通过。

#### 3.1.3 JSON、快照与补丁工具

- [ ] `src/core/json.ts`：`parseJson`/`asRecord`/`text`/`firstLine`/`failureOf`（`CliUnavailableError`→`unavailable`、超时→`unavailable`、输出超限→`too-large`、401/认证字样→`unauthenticated`）。
- [ ] `src/core/snapshot.ts`：`snapshotOf()` 填满 §2 列出的默认区块；`checksRollupOf()` 处理空集与优先级。
- [ ] `src/core/patch.ts`：`unifiedPatch()` 生成 `diff --git a/x b/x`、`--- a/x`、`+++ b/x`、原文 `@@` 段；新增文件 `--- /dev/null`，删除文件 `+++ /dev/null`。
- [ ] 三个文件各配单测，覆盖空列表、单文件、改名、新增、删除。
- **完成判据**：`pnpm vitest run test/core` 通过。

### 3.2 三个 provider 与 binding（并行）

#### 3.2.1 四个互不重叠的模块

- [ ] **Agent A**：`src/providers/gitlab/{urls,read,write,provider}.ts` + `test/providers/gitlab.test.ts` — GitLab 全套（`glab`），含 `-/-/merge_requests/<iid>` URL 规则与嵌套 group 的 owner/name 拆分（依赖：§2 冻结签名）。
- [ ] **Agent B**：`src/providers/gitea/{urls,read,write,provider}.ts` + `test/providers/gitea.test.ts` — Gitea/Forgejo（`gt`），`/pulls/<n>` URL 规则，`markReady` 返回 `failed`（Gitea 无 draft），`merge` 用 `gt api` + `head_commit_id`（依赖：§2 冻结签名）。
- [ ] **Agent C**：`src/providers/gitee/{urls,read,write,provider}.ts` + `test/providers/gitee.test.ts` — Gitee（`gitee`），`/pulls/<n>` URL 规则，`checks` 恒空，`merge` 失败原因原样透传（依赖：§2 冻结签名）。
- [ ] **Agent D**：`src/binding/{commands,service}.ts` + `test/binding/{commands,service}.test.ts` — 识别 `glab`/`gt`/`gitee` 命令字面量、从输出提取 http(s) URL（去尾标点）、经 `ctx.forge.changeRequestFromUrl()` 过滤后 `appendPluginRecord(session, 'plugin:forge-session/binding', { action: 'reference', url })`；同会话同 URL 只写一次（依赖：§2 冻结签名）。
- **完成判据**：`pnpm vitest run test/providers test/binding` 通过；四个模块的写入范围无交集。

### 3.3 装配与集成

#### 3.3.1 配置与插件入口

- [ ] `src/config.ts`：schemastery `Config` + `resolveConfig()`（默认值见 §2，host 校验同 `forge-github` 的 HOST 正则，数值必须为正安全整数）。
- [ ] `src/index.ts`：`apply()` 三次 `ctx.forge.register()`（顺序 gitlab → gitea → gitee），`binding === true` 时 `startBinding(ctx)`；CLI 不在 PATH 时不抛错（由 readiness 在运行时报告）。
- [ ] `test/config.test.ts`：默认值、非法 host、非法数值、空 command。
- **完成判据**：`pnpm build && pnpm vitest run test/config.test.ts` 通过。

#### 3.3.2 假 CLI 集成测试

- [ ] `test/integration/providers.test.ts`：在临时目录写三个可执行 shell 脚本（分别冒充 `glab`/`gt`/`gitee`），按参数返回录制 JSON（GitLab MR + diffs、Gitea PR + .diff + statuses、Gitee PR + files），用 `createCliRunner()` 走完整 provider 流程。
- [ ] 覆盖三条链路：`fetch()` 得到快照、`diff()` 得到补丁、`merge()` 在 head 不匹配时返回 `stale`。
- **完成判据**：`pnpm vitest run test/integration` 通过。

### 3.4 文档与验收

#### 3.4.1 双语文档

- [ ] `README.md` / `README.zh.md`：能力对照表（已支持 / 降级 / 不支持）、安装（`dsh plugin --profile <name> add dsh-gitall`）、配置示例（自建 GitLab/Gitea 的 hosts）、与 GitHub 的已知差异（无评审写入、Gitee 无 checks、登录提示走 `readiness.message`）。
- [ ] 在 `AGENTS.md` 的「项目地图」补上目录树。
- **完成判据**：两份 README 内容一致，命令与 §2 表格逐条对齐。

#### 3.4.2 人工验收（条件项）

- [ ] 若本机装了任一 CLI：在对应平台的真实仓库安装并在面板确认「仓库识别 → 登录态 → MR 卡片 → diff → merge」。
- [ ] 若未安装：以 §3.3.2 的录制 JSON + 假 CLI 结果作为验收依据，并在 README 标注「未做真机验证」。
- **完成判据**：验收清单逐项有结论（通过 / 以 fixture 替代）。

## 4 备注

- 上游可提的建议（不在本包实现）：给 `ForgeProvider` 增加 `signInHint` / `authCommand` 字段，让 `ForgeTab` 的登录引导对非 GitHub forge 也能渲染命令，从而去掉 `readiness.message` 里手写命令的权宜做法。
- 提交信息按 Conventional Commits 写，并在正文注明完成的节点编号（如 `feat(providers): add gitlab provider (3.2.1 Agent A)`）。
