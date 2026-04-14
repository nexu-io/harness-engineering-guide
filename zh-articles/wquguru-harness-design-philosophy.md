# WquGuru: Claude Code 和 Codex 的 Harness 设计哲学

> **原文**: [Tweet](https://x.com/wquguru/status/2039333332987810103) · WquGuru🦀 ([@wquguru](https://x.com/wquguru)) · April 1, 2026
> **Also recommended by**: 池建强 ([@sagacity](https://x.com/sagacity)) — [Tweet](https://x.com/sagacity/status/2042515263837605900), 1112 likes, 1616 bookmarks
> **Engagement**: 1,976 likes · 469 retweets · 403K views · 3,306 bookmarks
> **分类**: Deep Dive / Analysis

---

## 概述

WquGuru 发布了两本开放 PDF 书，对 Claude Code 和 Codex 的 harness 架构做了深度拆解。这不是功能对照表，而是从**系统骨架**的层面分析两者的设计哲学。

被社区广泛引用，池建强专门推荐并评论"文科生也能读得津津有味"。

---

## 两本书

### 1.《Harness Engineering —— Claude Code 设计指南》

> "不是源码注释汇编，也不是产品功能介绍。它关注的是 Claude Code 如何把不稳定模型收束进可持续运行的工程秩序。"

核心内容：
- **控制面**：主循环如何管理 agent 的执行流
- **工具权限**：哪些操作需要用户确认，哪些自动执行
- **上下文治理**：context window 填满时怎么办
- **恢复路径**：crash 后如何恢复到可用状态
- **多代理验证**：agent review agent 的机制
- **团队制度**：多人协作时的规则

### 2.《Claude Code 和 Codex 的 Harness 设计哲学 —— 殊途同归，还是各表一枝》

> "比较两套 AI coding harness，最容易犯的错误是拿一张功能对照表当作思想史。左边写'有技能'，右边也写'有技能'；左边写'有沙箱'，右边也写'有沙箱'。这样写的好处是省事，坏处是几乎什么也没说。因为工具中的名词相同，不代表系统的骨架相同。就像两个城市都修了桥，不能说明它们是按同一条河设计的。"

这段话精准捕捉了 harness 比较中最常见的错误：**表面相似性掩盖了架构本质的差异**。

---

## 池建强的评论

池建强（[@sagacity](https://x.com/sagacity)）在推荐这两本书时提出了一个重要问题：

> "Agent 在去年就人尽皆知了，与之相伴的 harness 为啥现在才冒出来？"

他的观察是：harness 一直存在，但之前被包裹在各家产品内部，不被独立讨论。随着 Claude Code 和 Codex 的源码/设计被逐步公开，harness 层才作为一个独立的工程学科浮现出来。

---

## 为什么重要

这两本书是目前对 Claude Code 和 Codex harness 内部机制最深入的公开分析。它们确立了一个重要原则：

> **比较 harness 不应该比较功能清单，而应该比较设计决策背后的假设。**

同样叫"记忆"的功能，在不同 harness 里可能基于完全不同的架构假设。理解这些假设，才能理解为什么同一个模型在不同 harness 里表现差异巨大。

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
