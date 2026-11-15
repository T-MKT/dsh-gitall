# AGENTS.md

## 环境要求
项目全局使用 `pnpm` 进行操作。

当前项目基线 `dsh` 版本：`0.2.2-rc.3`
当前项目兼容 `dsh` 版本：`0.2.2-rc.3`

## 工作原则
- **禁止修改 `dsh` 源代码。**（源代码指 node_module 文件，不含 `~/.dsh` 的配置文件。）
- 高内聚低耦合，文件及文件夹职责清晰。
- 保持简洁。如无必要，勿增实体。

- 不保留向后兼容性。直接移除过时的路径，而不是添加兼容层、回退机制或迁移逻辑。
- 注意 `dsh` 的接口可用性。

## 项目地图

```text
dsh-gitall/
├── package.json                 # 包清单：dsh.bundle.patch、exports、peer/deps
├── tsconfig.json                # 类型检查（含 test）
├── tsconfig.build.json          # 只编译 src → lib
├── vitest.config.ts             # 测试入口
├── cordis.patch.yml             # 把本插件 insert 进 profile
├── README.md / README.en.md     # 中英双语文档
├── src/
│   ├── index.ts                 # 插件入口：注册三个 provider 并启动 binding
│   ├── config.ts                # schemastery Config + resolveConfig()
│   ├── core/                    # 平台无关的 CLI 调用、JSON、快照与补丁工具
│   │   ├── cli.ts
│   │   ├── json.ts
│   │   ├── snapshot.ts
│   │   └── patch.ts
│   ├── providers/
│   │   ├── gitlab/              # urls / read / write / provider
│   │   ├── gitea/               # 同上
│   │   └── gitee/               # 同上
│   └── binding/                 # glab/gt/gitee 命令识别与 Session 绑定记录
│       ├── commands.ts
│       └── service.ts
└── test/
    ├── config.test.ts
    ├── core/                    # cli / json / snapshot / patch
    ├── providers/               # 三个 provider 的单测
    ├── binding/                 # commands / service
    └── integration/             # 假 CLI 端到端测试
```
