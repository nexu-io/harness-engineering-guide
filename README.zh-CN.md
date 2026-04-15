# 驾驭工程指南

<p align="center">
  <em>AI Agent Harness 实战指南 — 每篇配有可运行的代码示例。</em>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/harness-engineering-guide/stargazers"><img src="https://img.shields.io/github/stars/nexu-io/harness-engineering-guide?style=social" alt="Stars"></a>
  <a href="https://github.com/nexu-io/harness-engineering-guide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  🌐 <b><a href="https://harness-guide.com/zh/">harness-guide.com/zh</a></b> | <a href="https://harness-guide.com">English</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <b>中文</b>
</p>

---

**Harness** 是包裹语言模型的运行时层，将裸模型变成一个 **Agent** — 能感知环境、做出决策、多步执行动作的自主系统。Harness 负责模型自身做不了的一切：执行 Tool、管理 Memory、组装 Context、以及强制执行安全边界。

本指南从第一性原理到生产模式，每篇文章都配有可运行的代码。

---

## 入门

| 主题 | 描述 |
|------|------|
| [什么是 Harness？](guide/what-is-harness.md) | 3 分钟理解核心概念。模型如何变成 Agent。Harness vs Framework vs Runtime。 |
| [搭建你的第一个 Harness](guide/your-first-harness.md) | 50 行 Python 搭建一个可运行的 Harness。完整代码可直接复制。 |
| [Harness 与 Framework 的区别](guide/harness-vs-framework.md) | 什么时候用 Harness，什么时候用 LangChain/CrewAI。决策树 + 代码对比。 |

## 核心概念

| 主题 | 描述 |
|------|------|
| [Agentic Loop](guide/agentic-loop.md) | think → act → observe 循环。Turn 预算、并行 Tool 调用、循环检测、Streaming。 |
| [Tool System](guide/tool-system.md) | Tool 注册、静态 vs 动态加载、MCP 协议、描述质量模式。 |
| [Memory & Context](guide/memory-and-context.md) | Context 组装、Session 管理、两级 Memory（日志 + 长期记忆）。AGENTS.md 和 MEMORY.md 模式。 |
| [Guardrails](guide/guardrails.md) | 权限模型、信任边界、Sandbox、Prompt Injection 防御。 |

## 实战

| 主题 | 描述 |
|------|------|
| [Context Engineering](guide/context-engineering.md) | 优先级组装、压缩三道防线、Token 预算。 |
| [Sandbox](guide/sandbox.md) | Docker 和 Firecracker 配置、网络隔离、文件系统限制。 |
| [Skill System](guide/skill-system.md) | Skill 打包、按需加载、SKILL.md 格式、薄 Harness + 厚 Skill。 |
| [Sub-Agent](guide/sub-agent.md) | Leader-Worker 模式、文件通信、Session 隔离、并行执行。 |
| [Error Handling](guide/error-handling.md) | 错误分类、重试策略、优雅降级、Checkpoint/Resume。 |

## 参考

| 主题 | 描述 |
|------|------|
| [实现对比](guide/comparison.md) | OpenClaw、Claude Code、Codex、Cline、Aider、Cursor 横向对比。 |
| [术语表](guide/glossary.md) | 关键术语定义。 |

---

## 如何贡献

1. 前往 [**Issues → New Issue**](https://github.com/nexu-io/harness-engineering-guide/issues/new/choose)
2. 选择 **"📬 Submit a Resource"**
3. 填写标题、链接和推荐理由

也欢迎直接提交 PR — 参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 社区

- 💬 **GitHub Discussions** — [参与讨论](https://github.com/nexu-io/harness-engineering-guide/discussions)
- 🐦 **Twitter** — [@nexudotio](https://x.com/nexudotio)
- 💬 **飞书群** — [加入 Harness Engineering 话题群](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=717g465a-0bc8-4242-9281-12b23953491a)

---

## 关于

由 [Nexu](https://github.com/nexu-io) 维护 — 开源 Claude Co-worker & Managed Agent 平台。

## 协议

[MIT License](LICENSE)
