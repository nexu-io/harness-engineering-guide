# 驾驭工程：从 Claude Code 源码到 AI 编码最佳实践（《马书》）

> **原文**: [Tweet](https://x.com/QingQ77/status/2040709023058583774) · Geek Lite ([@QingQ77](https://x.com/QingQ77)) · April 5, 2026
> **Engagement**: 400 likes · 127 retweets · 34K views · 561 bookmarks
> **分类**: Deep Dive / Book

---

## 概述

《马书》（Harness = 马具，故名"马书"）是一本围绕 Harness Engineering 的中文技术书，以 Claude Code v2.1.88 的公开发布包与 source map 还原结果为分析材料。

它不试图复刻官方产品文档，而是从真实工程实现中提炼 AI 编码 Agent 的架构模式、上下文策略、权限体系和生产实践。

---

## Core Topics

- **架构模式**：Claude Code 的主循环如何设计，控制流如何分发
- **上下文策略**：context window 填满时的处理机制
- **权限体系**：哪些工具需要用户确认，安全边界如何划定
- **生产实践**：从源码中可观察到的工程决策和 trade-off

---

## Why It Matters

这是目前少数基于 **实际源码分析**（而非猜测或官方文档转述）的 harness 技术书籍。对于想深入理解 Claude Code 内部机制的开发者来说，这是必读材料。

---

*See also: [Claude Code & Codex Harness Design Philosophy](wquguru-harness-design-philosophy.md) · [Components of a Coding Agent](coding-agent-components.md)*
