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

**Harness（驾驭层）** 是包裹 AI 模型的运行时层，负责把一个裸模型变成真正有用的 Agent。它处理模型自己做不了的事：读写文件、调用工具、跨会话记忆、以及决定何时停止。当 AI Agent 从演示走向生产，Harness 层——而非模型本身——正在成为产品的核心差异化。

本指南覆盖 Harness Engineering 的方方面面，从写第一个工具调用循环到在生产环境运行多 Agent 系统。

---

## 入门

| 主题 | 描述 |
|------|------|
| [什么是 Harness？](guide/what-is-harness.md) | 3 分钟理解核心概念。最简代码示例。Harness vs 框架 vs 运行时。 |
| [搭建你的第一个 Harness](guide/your-first-harness.md) | 15 分钟搭建一个可运行的 Harness。完整 Python 代码。 |
| [Harness 和框架的区别](guide/harness-vs-framework.md) | 什么时候用 Harness，什么时候用 LangChain/CrewAI。决策树 + 代码对比。 |

## 核心模式

| 主题 | 描述 |
|------|------|
| [AGENTS.md 模式](guide/agents-md.md) | 用纯文本文件定义 Agent 行为。可版本控制、可移植、完全透明。 |
| [MEMORY.md 模式](guide/memory-md.md) | 持久化记忆：每日日志 + 长期精选记忆。 |
| [工具调用循环](guide/tool-loop.md) | ReAct 模式的工程实现。添加工具不改循环。 |
| [Skill 按需加载](guide/skill-loading.md) | 按需加载工具而非一次性全部塞入。Token 消耗对比。 |
| [薄 Harness 架构](guide/thin-harness.md) | 为什么 Harness 应该尽量薄。薄 Harness + 厚 Skills。 |
| [上下文窗口管理](guide/context-window.md) | 优先级系统、Token 预算、滑窗实现。 |

## 实战技术

| 主题 | 描述 |
|------|------|
| [上下文压缩](guide/context-compression.md) | 三道防线：自动衰减、阈值压缩、主动压缩。 |
| [多 Agent 协作](guide/multi-agent.md) | Leader-Worker、文件夹收件箱、握手协议、自动认领、Git Worktree 隔离。 |
| [Git Worktree 隔离](guide/git-worktree-isolation.md) | 并行 Agent 任务互不冲突。逐步命令。 |
| [沙箱与安全](guide/sandbox-security.md) | Docker、Firecracker、WASM。权限模型和信任边界。 |
| [结构化输出](guide/structured-output.md) | 让 Agent 返回可解析的数据。JSON 模式、Schema 校验。 |
| [错误恢复](guide/error-recovery.md) | 重试策略、优雅降级、人工介入升级。 |
| [评估与测试](guide/eval-and-testing.md) | 行为测试、Trace 回放、最简评估框架。 |

## 进阶

| 主题 | 描述 |
|------|------|
| [Harness 即服务](guide/harness-as-a-service.md) | 云端运行 Harness。多租户架构。 |
| [Meta-Harness](guide/meta-harness.md) | Agent 优化自己的 Harness。AutoAgent 模式。 |
| [记忆可移植性](guide/memory-portability.md) | 在不同 Harness 实现间迁移记忆。迁移脚本。 |
| [三维扩展](guide/scaling-dimensions.md) | 时间 × 空间 × 交互 框架，分析任何 Harness。 |

## 参考

| 主题 | 描述 |
|------|------|
| [实现对比](guide/comparison.md) | OpenClaw、Claude Code、Codex、Cline、Aider、Cursor、Nexu 横向对比。 |
| [术语表](guide/glossary.md) | 23 个关键术语定义。 |

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
