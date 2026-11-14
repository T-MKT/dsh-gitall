# dsh-gitall

[简体中文](./README.md) | [English](./README.en.md)

Brings GitLab, Gitea/Forgejo, and Gitee repositories to the DeepSeek Harness
change request panel. One host-only plugin registers three `ctx.forge`
providers (`gitlab`, `gitea`, `gitee`) and reads each platform through its
official CLI (`glab`, `gt`, `gitee`). Credentials stay in the CLIs' own
configuration; the plugin never sees a token.

## Requirements

- DeepSeek Harness `0.2.2-rc.2`.
- Node.js 22 or newer.
- A logged-in CLI for each platform you use:
  - [`glab`](https://gitlab.com/gitlab-org/cli) for GitLab
  - [`gt`](https://gitea.com/gitea/cli) for Gitea 28+ and Forgejo releases that ship the same API
  - [`gitee`](https://gitee.com/oschina/gitee-cli) for Gitee

A missing CLI is not a startup error. The provider reports `unavailable` from
`readiness`, so the panel shows why it cannot read a repository.

## Install

```sh
dsh plugin --profile <name> add dsh-gitall
```

The package ships `cordis.patch.yml`, which inserts the `gitall` entry into the
profile.

## Configuration

Add the entry to the profile's `cordis.patch.yml` (or edit the inserted entry):

```yaml
- id: gitall
  name: dsh-gitall
  config:
    # Optional: self-hosted instances must be listed or their repositories are not served.
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

| Key | Default | Meaning |
| --- | --- | --- |
| `gitlab.command` | `glab` | GitLab CLI executable or absolute path |
| `gitlab.hosts` | `['gitlab.com']` | Hosts served by the GitLab provider; list self-hosted hosts explicitly |
| `gitea.command` | `gt` | Gitea CLI executable or absolute path |
| `gitea.hosts` | `[]` | Hosts served by the Gitea provider; empty means it serves nothing |
| `gitee.command` | `gitee` | Gitee CLI executable or absolute path |
| `gitee.hosts` | `['gitee.com']` | Hosts served by the Gitee provider |
| `timeoutMs` | `30000` | Deadline for one CLI invocation |
| `maxOutputBytes` | `8388608` | Captured bytes per CLI output stream |
| `binding` | `true` | Bind change request URLs printed by agent CLI calls to the Session |

Hosts are matched case-insensitively. A host name may carry a port
(`git.example.org:8443`); HTTP(S) remotes use that port, SSH remotes do not.

## What works

| Capability | GitLab | Gitea/Forgejo | Gitee |
| --- | --- | --- | --- |
| Recognize a repository from its Git remote | yes | yes | yes |
| Status card (title, state, draft, author, branches, +/-, mergeability) | yes | yes | yes |
| Checks | head pipeline | commit statuses | none (Gitee v5 exposes no CI API) |
| Diff patch | yes | yes | yes |
| File text at a commit | yes | yes | yes |
| Merge with the confirmed head | yes (`glab --sha`) | yes (`head_commit_id`) | yes (head checked first) |
| Merge methods offered | merge, squash, rebase | merge, squash, rebase | merge, squash |
| Mark a draft ready | yes | no draft state: reports `failed` | yes |
| Find open requests for a pushed branch | yes | yes | yes |
| Bind a change request URL printed by the CLI to the Session | yes | yes | yes |
| Review threads, comments, approvals | not implemented | not implemented | not implemented |
| Commit list / compare | not implemented | not implemented | not implemented |
| Viewed files, rerun checks, request reviewers, update branch | not implemented | not implemented | not implemented |

Not implementing an optional capability is a supported degradation: the panel
hides the corresponding controls.

## Signing in

The plugin runs each CLI with a scrubbed environment, so variables whose names
contain `KEY`, `PASSWORD`, `SECRET`, or `TOKEN` never reach it. Sign in with the
CLI itself:

```sh
glab auth login --hostname gitlab.example.org
gt auth login --host https://gitea.example.org
gitee auth login
```

When a host is not signed in, `readiness` reports `unauthenticated` with the
CLI's own message; the panel renders that message, which is where the commands
above reach the user for non-GitHub hosts.

## How it reads

| Platform | Snapshot | Diff | File text | Merge | Readiness |
| --- | --- | --- | --- | --- | --- |
| GitLab | `glab api --hostname <host> projects/<urlencoded path>/merge_requests/<iid>` | `…/merge_requests/<iid>/diffs` + `+`/`-` line counts | `…/repository/files/<urlencoded path>/raw?ref=<sha>` | `glab mr merge <iid> --sha <sha> --yes --auto-merge=false` | `glab auth status --hostname <host>` |
| Gitea | `gt api repos/<owner>/<repo>/pulls/<n> --host <host> --no-input` | `…/pulls/<n>.diff` after the head is confirmed | `…/raw/<path>?ref=<sha>` | `gt api -X POST …/pulls/<n>/merge -f Do=<method> -f head_commit_id=<sha>` | `gt auth status --host <host>` |
| Gitee | `gitee api /repos/<owner>/<repo>/pulls/<n> --hostname <host> --no-tui` | `…/pulls/<n>/files` composed into one patch | `…/contents/<path>?ref=<sha>` (base64 decoded) | head checked, then `gitee api -X PUT …/pulls/<n>/merge -f merge_method=<method>` | `gitee auth status --json --hostname <host> --no-tui` |

## Known differences from GitHub

- No review read or write, no commit list, no viewed marks, no check reruns, no
  review requests, and no branch updates. Those provider methods are omitted.
- Gitee has no check support, so its snapshot always has `checks: []` and
  `checksRollup: 'none'`.
- Gitea has no draft pull requests, so `markReady` always resolves to a
  `failed` action explaining that limit.
- Gitee's merge endpoint cannot name the confirmed head commit. The provider
  reads the head first and refuses with `stale` when it moved, but a push in the
  instant between that read and the merge cannot be detected. Gitee also offers
  only merge and squash here; a rebase request is refused.
- Binding reads URLs only from the output of `glab`, `gt`, and `gitee`
  commands. A bare number such as `glab mr view 42` is not looked up.
- Self-hosted Gitea/Forgejo instances must be listed in `gitea.hosts`; there is
  no wildcard.
- Gitea requires version 28 or newer (a `gt` requirement).
- The plugin has not been run against the real CLIs or real hosts. Its tests
  drive fake `glab`/`gt`/`gitee` executables that return recorded JSON, and the
  provider logic is exercised end to end that way.

## Development

```sh
pnpm install
pnpm build      # tsc -p tsconfig.build.json → lib/
pnpm typecheck  # tsc -p tsconfig.json
pnpm test       # vitest run
```

Layout: `src/core` holds the CLI runner, JSON helpers, snapshot defaults, and
patch assembly; `src/providers/<forge>` holds URL parsing, reads, writes, and
the provider class; `src/binding` turns CLI output into Session binding records;
`test/integration` runs the providers through the fake CLIs.
