# Kitaru 0.4.0: 把记忆内置于 Harness

> **原文**: [Tweet](https://x.com/strickvl/status/2043620630273343925) · Alex Strick van Linschoten ([@strickvl](https://x.com/strickvl)) · April 13, 2026
> **分类**: Practice / Implementation

---

## 概述

Harrison Chase 提出 "Your Harness, Your Memory" 之后，Kitaru 团队是第一批将这个理念落地实现的。Kitaru 0.4.0 把记忆系统直接内置于 harness 基底，而非依赖外部记忆服务。

---

## Three Design Decisions

### 1. 版本化免费获得

每次 `memory.set()` 都创建一个新版本。软删除留下 tombstone。你可以问 "哪次 run 教会了 agent 这个？" 并得到真实的答案。

### 2. 作用域匹配 Agent 实际工作方式

- **Namespace** — 项目/repo 级别的约定
- **Flow** — 每个 agent 的学习状态
- **Execution** — 每次 run 的进度

不需要把所有东西塞进一个全局 blob。

### 3. 溯源自动化

因为 memory 和 artifacts 共享同一个后端，审计追踪不需要跨系统拼接。

---

## Why Not External Memory Providers?

Kitaru 团队考虑过集成 Mem0、Letta 等专门的记忆服务。但一旦映射出版本化和溯源在两个系统之间会是什么样子，"接缝"就开始显现。

> *"Managing memory is a core responsibility of the harness, not a peripheral one."*

这呼应了 Harrison Chase 的核心观点：记忆不应该被外包给第三方。

---

*See also: [Memory Systems](../guide/memory.md) · [OpenAI: Harness Engineering](openai-harness-engineering.md)*
