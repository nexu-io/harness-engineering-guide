# Harness Engineering 入门

## 什么是 Harness？

**Harness** 是包裹 AI 模型、将其变成一个有用 Agent 的运行时层。它是原始 LLM API 调用和最终用户体验之间的一切：

```
┌─────────────────────────────────────────┐
│              用户 / 界面                  │
├─────────────────────────────────────────┤
│            Agent Harness                 │
│  ┌─────────┬──────────┬──────────────┐  │
│  │ 上下文  │ 记忆系统  │ Skill/工具   │  │
│  │ 管理    │          │ 编排         │  │
│  ├─────────┼──────────┼──────────────┤  │
│  │ 安全层  │ 生命周期  │ 多 Agent    │  │
│  │         │ 管理     │ 协调         │  │
│  └─────────┴──────────┴──────────────┘  │
├─────────────────────────────────────────┤
│          模型 API (LLM)                  │
│     GPT / Claude / Gemini / 开源         │
└─────────────────────────────────────────┘
```

打个比方：如果 AI Agent 是一辆赛车，模型是引擎，但 harness 是*其他所有东西* — 底盘、悬挂、遥测、进站策略。

## Harness vs Runtime vs Framework

这些术语经常被混淆。我们这样区分：

| 术语 | 定义 | 示例 |
|------|------|------|
| **模型 (Model)** | LLM 本身 | Claude 4.6, GPT-5, Gemini 2.5 |
| **框架 (Framework)** | 构建 LLM 应用的库 | LangChain, LlamaIndex, CrewAI |
| **运行时 (Runtime)** | 执行环境 | OpenClaw, Deno, Node.js |
| **Harness** | 将模型包装成 Agent 的完整控制层 | Claude Code (51.2万行), Codex harness, OpenClaw agent 配置 |

**框架**提供积木块。**Harness** 是成品 — 特定的配置、记忆系统、工具集、安全规则和编排逻辑，将模型变成*你的* Agent。

### 核心洞察

> 框架是共享的。Harness 是自己拥有的。

当 Harrison Chase 说"如果你不拥有 harness，你就不拥有记忆"时，他的意思是：谁控制 harness，谁就控制 Agent 记住什么、能做什么、如何行为。

## 为什么 Harness Engineering 重要

### 1. 模型正在商品化

前沿模型和开源模型之间的差距在缩小。GPT、Claude、Gemini、Llama、Qwen — 都能遵循指令、写代码、使用工具。模型正在变成大宗商品。

什么*不是*大宗商品：你如何把模型接入工作流、喂什么上下文、如何记住历史交互、Agent 能用什么工具。

### 2. Harness 才是护城河

基于原始模型 API 构建的公司没有护城河 — 任何人都能换模型。构建了精密 harness（上下文管理、持久化记忆、领域特定 Skill）的公司才有真正的防御性。

Claude Code 的 harness 有 51.2 万行代码。这不是套壳 — 这是一个产品。

### 3. Harness Engineering 正在成为一种职业

就像"Prompt Engineering"成为了一门学科，Harness Engineering 正在作为一种独立技能浮现：
- 设计记忆架构（会话 vs 长期，本地 vs 云端）
- 构建安全和权限系统
- 编排多 Agent 工作流
- 优化上下文窗口
- 管理 Agent 生命周期和状态

### 4. 开放 Harness vs 封闭 Harness

行业正在分化为两个阵营：

| | 开放 Harness | 封闭 Harness |
|--|-------------|-------------|
| **示例** | OpenClaw, Nexu | Claude Code, Codex |
| **记忆** | 用户拥有，可迁移 | 平台拥有，锁定 |
| **模型** | 任意模型 | 厂商绑定 |
| **Skill** | 社区生态 | 厂商策划 |
| **定制化** | 完全控制 | 有限配置 |

本指南倡导开放的 Harness Engineering — 不是因为封闭 harness 不好，而是因为理解黑盒内部的原理，无论你用哪个平台都能让你成为更好的工程师。

---

*下一篇：[核心概念 →](concepts.md)*
