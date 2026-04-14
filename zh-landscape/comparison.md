# Harness 实现对比

主流 AI Agent Harness 实现的横向对比。最后更新：2026 年 4 月。

## 总览

| 项目 | Stars | 许可证 | 模型支持 | 记忆模型 | 架构 |
|------|-------|-------|---------|---------|------|
| **[OpenClaw](https://github.com/openclaw/openclaw)** | 355K | Apache-2.0 | 任意模型 | 用户自有文件 | 薄 Harness + Skills |
| **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | — | 专有 | 仅 Claude | 平台托管 | 一体化 |
| **[Codex](https://openai.com/codex)** | — | 专有 | 仅 GPT | 加密摘要 | 云端 HaaS |
| **[Cline](https://github.com/cline/cline)** | ~60K | Apache-2.0 | 多模型 | 会话级 | VS Code 扩展 |
| **[Aider](https://github.com/paul-gauthier/aider)** | ~43K | Apache-2.0 | 多模型 | 基于 Git | CLI 工具 |
| **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** | 70K | MIT | 多模型 | 可配置 | 多智能体框架 |
| **[Nexu](https://github.com/nexu-io/nexu)** | 2.3K | MIT | 任意模型 | 用户自有文件 | 桌面客户端 + Harness |

## 详细对比

### 上下文管理

| 项目 | 最大上下文 | 溢出策略 | 上下文优先级 |
|------|-----------|---------|------------|
| OpenClaw | 模型上限 | 摘要 + 滑窗 | 可配置 |
| Claude Code | 200K | 内置压缩 | 自动 |
| Codex | 模型上限 | 云端管理 | 自动 |
| Cline | 模型上限 | 截断 | 手动 |
| Aider | 模型上限 | 仓库地图 | 自动 |

### 记忆持久化

| 项目 | 记忆类型 | 跨会话 | 可导出 | 可编辑 |
|------|---------|--------|-------|--------|
| OpenClaw | MEMORY.md + 日志文件 | ✅ | ✅ | ✅ |
| Claude Code | CLAUDE.md + 平台 | ✅ | ❌ | 部分 |
| Codex | 加密摘要 | ✅ | ❌ | ❌ |
| Cline | .cline/ 目录 | ✅ | ✅ | ✅ |
| Aider | Git 历史 | ✅ | ✅ | ✅ |
| Nexu | MEMORY.md + wiki/ | ✅ | ✅ | ✅ |

### Skill / 工具系统

| 项目 | Skill 模型 | 社区 Skills | 安装方式 |
|------|-----------|------------|---------|
| OpenClaw | 基于 SKILL.md | 5,400+ | `openclaw skill install` |
| Claude Code | 内置 + MCP | 有限 | MCP 配置 |
| Codex | 内置 | 无 | — |
| Cline | MCP 集成 | 通过 MCP | MCP 配置 |
| Aider | 内置 | 有限 | — |
| Nexu | OpenClaw Skills | 5,400+ | GUI 或 CLI |

### 多智能体支持

| 项目 | 多智能体 | 协调方式 | 可观测性 |
|------|---------|---------|---------|
| OpenClaw | 子智能体 + 会话 | Hub-and-spoke | 会话日志 |
| Claude Code | 有限（工具调用） | 顺序执行 | — |
| Codex | Codex 任务 | 并行任务 | 仪表盘 |
| Hermes Agent | 原生多智能体 | 可配置 | 内置 |
| Nexu | 子智能体 + ACP | Hub-and-spoke | 仪表盘 |

---

*本对比由社区维护。如有不准确之处，请 [提交 Issue](https://github.com/nexu-io/harness-engineering-guide/issues)。*
