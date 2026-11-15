<div align="center">

<h1>dsh-gitall</h1>

[简体中文](./README.md) | [English](./README.en.md)

</div>

让 DeepSeek Harness 的变更请求面板支持 GitLab、Gitea/Forgejo 与 Gitee。这是一个
**单包、host-only** 插件：向 `ctx.forge` 注册 `gitlab`、`gitea`、`gitee` 三个
provider，分别通过各平台官方 CLI（`glab`、`gt`、`gitee`）读取数据。凭据保留在
CLI 自己的配置里，插件不会接触 token。

## 环境要求

- DeepSeek Harness `0.2.2-rc.3`。
- Node.js 24.9 或更新版本。
- 为要使用的平台准备已登录的 CLI：
  - GitLab：[`glab`](https://gitlab.com/gitlab-org/cli)
  - Gitea 28+ / 提供相同 API 的 Forgejo：[`gt`](https://gitea.com/gitea/cli)
  - Gitee：[`gitee`](https://gitee.com/oschina/gitee-cli)

CLI 未安装不会导致插件启动失败：对应 provider 在 `readiness` 中报告
`unavailable`，面板会显示无法读取仓库的原因。

## 安装

### 通过 Github 安装

```sh
dsh plugin --profile <name> add github:https://github.com/T-MKT/dsh-gitall
```


## 配置

在 profile 的 `cordis.patch.yml` 中添加（或修改插入的）条目：

```yaml
- id: gitall
  name: dsh-gitall
  config:
    # 可选：自建实例必须显式列出，否则其仓库不会被服务。
    gitlab:
      command: glab
      hosts:
        - gitlab.com
        - gitlab.example.org
    gitea:
      command: gt
      hosts:
        - gitea.example.org
    gitee:
      command: gitee
      hosts:
        - gitee.com
    timeoutMs: 30000
    maxOutputBytes: 8388608
    binding: true
```

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `gitlab.command` | `glab` | GitLab CLI 可执行文件名或绝对路径 |
| `gitlab.hosts` | `['gitlab.com']` | GitLab provider 服务的 host，自建实例需显式列出 |
| `gitea.command` | `gt` | Gitea CLI 可执行文件名或绝对路径 |
| `gitea.hosts` | `[]` | Gitea provider 服务的 host；为空表示不服务任何仓库 |
| `gitee.command` | `gitee` | Gitee CLI 可执行文件名或绝对路径 |
| `gitee.hosts` | `['gitee.com']` | Gitee provider 服务的 host |
| `timeoutMs` | `30000` | 单次 CLI 调用的超时 |
| `maxOutputBytes` | `8388608` | 每条输出流的最大捕获字节数 |
| `binding` | `true` | 把 agent 执行 CLI 时输出的变更请求 URL 绑定到 Session |

host 匹配不区分大小写。host 可带端口（`git.example.org:8443`）：HTTP(S) 远端的
端口属于 host 身份，SSH 远端的端口会被忽略。

## 能力对照

| 能力 | GitLab | Gitea/Forgejo | Gitee |
| --- | --- | --- | --- |
| 从 Git remote 识别仓库 | 支持 | 支持 | 支持 |
| 状态卡片（标题、状态、草稿、作者、分支、增删行数、可合并性） | 支持 | 支持 | 支持 |
| 检查（checks） | head pipeline | commit statuses | 无（Gitee v5 没有对外的 CI 接口） |
| diff 补丁 | 支持 | 支持 | 支持 |
| 读取某提交的文件文本 | 支持 | 支持 | 支持 |
| 按确认的 head 合并 | 支持（`glab --sha`） | 支持（`head_commit_id`） | 支持（先读 head 再合并） |
| 面板提供的合并方式 | merge、squash、rebase | merge、squash、rebase | merge、squash |
| 标记草稿为就绪 | 支持 | 无草稿状态，返回 `failed` | 支持 |
| 按分支查找打开的变更请求 | 支持 | 支持 | 支持 |
| 把 CLI 输出中的变更请求 URL 绑定到 Session | 支持 | 支持 | 支持 |
| 评审线程、评论、批准 | 未实现 | 未实现 | 未实现 |
| 提交列表 / 提交间比较 | 未实现 | 未实现 | 未实现 |
| 已读文件、重跑检查、请求评审、更新分支 | 未实现 | 未实现 | 未实现 |

未实现的都是 provider 的可选能力，缺省即降级，面板会隐藏对应控件。

## 登录

插件以「清洗过的环境」启动 CLI：名字包含 `KEY`、`PASSWORD`、`SECRET`、`TOKEN`
的变量不会传给子进程。请用各自的 CLI 登录：

```sh
glab auth login --hostname gitlab.example.org
gt auth login --host https://gitea.example.org
gitee auth login
```

host 未登录时，`readiness` 返回 `unauthenticated` 并带上 CLI 自己的提示；面板会
渲染这条消息，非 GitHub forge 的登录引导就靠它传达上述命令。

## 数据来源

| 平台 | 快照 | diff | 文件文本 | 合并 | 就绪探测 |
| --- | --- | --- | --- | --- | --- |
| GitLab | `glab api --hostname <host> projects/<URL 编码路径>/merge_requests/<iid>` | `…/merge_requests/<iid>/diffs`，按 `+`/`-` 行统计 | `…/repository/files/<URL 编码路径>/raw?ref=<sha>` | `glab mr merge <iid> --sha <sha> --yes --auto-merge=false` | `glab auth status --hostname <host>` |
| Gitea | `gt api repos/<owner>/<repo>/pulls/<n> --host <host> --no-input` | 先确认 head，再读 `…/pulls/<n>.diff` | `…/raw/<path>?ref=<sha>` | `gt api -X POST …/pulls/<n>/merge -f Do=<method> -f head_commit_id=<sha>` | `gt auth status --host <host>` |
| Gitee | `gitee api /repos/<owner>/<repo>/pulls/<n> --hostname <host> --no-tui` | `…/pulls/<n>/files` 合成为统一补丁 | `…/contents/<path>?ref=<sha>`（base64 解码） | 先确认 head，再 `gitee api -X PUT …/pulls/<n>/merge -f merge_method=<method>` | `gitee auth status --json --hostname <host> --no-tui` |

## 与 GitHub 的已知差异

- 不做评审读写、提交列表、已读标记、检查重跑、请求评审、更新分支；对应
  provider 方法直接缺省。
- Gitee 不支持 checks：快照恒为 `checks: []`、`checksRollup: 'none'`。
- Gitea 没有草稿 PR：`markReady` 恒返回 `failed` 并说明该限制。
- Gitee 的合并接口无法指定「确认过的 head 提交」。provider 先读 head，发现已变化
  就返回 `stale`；但在读与合并之间瞬间发生的推送无法检测。Gitee 在此只提供
  merge 与 squash，rebase 请求会被拒绝。
- binding 只从 `glab`、`gt`、`gitee` 命令的输出中提取 URL；`glab mr view 42`
  这种只给编号的形式不会再去查询。
- 自建 Gitea/Forgejo 必须写进 `gitea.hosts`，不支持通配。
- Gitea 需要 28 或更新版本（`gt` 的要求）。
- **未做真机验证**：本机没有安装这些 CLI，测试用返回录制 JSON 的假
  `glab`/`gt`/`gitee` 可执行文件，端到端跑通 provider 逻辑。

## 开发

```sh
pnpm install
pnpm build      # tsc -p tsconfig.build.json → lib/
pnpm typecheck  # tsc -p tsconfig.json
pnpm test       # vitest run
```

目录：`src/core` 放 CLI runner、JSON 助手、快照默认值与补丁合成；
`src/providers/<forge>` 放 URL 解析、读取、写入与 provider 类；`src/binding`
把 CLI 输出转成 Session 绑定记录；`test/integration` 用假 CLI 跑完整 provider
流程。
