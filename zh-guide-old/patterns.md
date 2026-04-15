# 架构模式

## Thin Harness + Thick Skills（薄 Harness + 厚 Skill）

Harness 提供最小核心基础设施（上下文管理、记忆、消息路由），所有领域逻辑都在模块化、可安装的 Skill 中。

**优势：** 模块化、社区可扩展、模型无关
**劣势：** Skill 质量参差不齐、协调复杂
**示例：** OpenClaw, Nexu

## Monolithic Harness（单体 Harness）

所有 Agent 逻辑内置于一个紧密集成的系统中。

**优势：** 深度优化、行为一致、易于调试
**劣势：** 厂商锁定、难以扩展、模型绑定
**示例：** Claude Code, Cursor Agent

## Harness-as-a-Service（Harness 即服务）

Harness 运行在云端，由平台管理。用户配置但不托管。

**优势：** 零运维、随时可用、托管扩容
**劣势：** 数据离开本机、平台依赖
**示例：** Claude Managed Agent, Codex cloud

## 对比：Claude Code vs Codex vs OpenClaw

| 维度 | Claude Code | Codex | OpenClaw |
|------|-----------|-------|----------|
| **Harness 规模** | ~51.2万行 | 未知（闭源） | ~5万行 |
| **模型支持** | 仅 Claude | 仅 GPT | 任意模型 |
| **记忆** | 平台管理 | 加密摘要 | 用户拥有文件 |
| **Skill** | 内置工具 | 内置工具 | 社区 Skill |
| **定制化** | CLAUDE.md | AGENTS.md（有限） | AGENTS.md + MEMORY.md + Skills |
| **开源** | 否（源码可见） | 否 | 是（MIT） |

### 怎么选？

| 如果你需要... | 选择... |
|--------------|---------|
| 最大控制和定制 | Thin harness (OpenClaw/Nexu) |
| 最佳单模型体验 | Monolithic (Claude Code) |
| 零配置，云优先 | HaaS (Managed Agent) |
| 多 Agent 协作 | Thin harness + multi-agent |

---

*下一篇：[记忆系统 →](memory.md)*
