# 核心概念

本章介绍 Harness Engineering 的五大支柱。每个都是一个深度话题 — 这里介绍基础，链接到更深入的内容。

## 上下文管理 (Context Management)

上下文是每次交互时喂给模型的信息。管理好上下文是 Agent 体验好坏的关键。

### 上下文窗口问题

每个模型都有有限的上下文窗口（8K–2M tokens）。你的 harness 必须决定：
- **放什么进去** — 系统 prompt、对话历史、文件内容、工具调用结果
- **丢弃什么** — 旧消息、冗余信息、已解决的线程
- **什么顺序** — 上下文来源的优先级排序

### 策略对比

| 策略 | 原理 | 取舍 |
|------|------|------|
| **滑动窗口** | 保留最近 N 条消息 | 丢失早期上下文 |
| **摘要压缩** | 将旧上下文压缩为摘要 | 有损但紧凑 |
| **检索增强 (RAG)** | 按需检索相关上下文 | 需要索引 |
| **分层管理** | 多层：热（近期）+ 温（会话）+ 冷（归档） | 复杂但高效 |

---

## 记忆与持久化 (Memory & Persistence)

记忆是跨会话存活的上下文。没有它，你的 Agent 每次醒来都是失忆状态。

### 记忆层级

```
┌─ 工作记忆 ──────── 当前对话上下文
├─ 会话记忆 ──────── 一次会话内存活（临时文件、状态）
├─ 长期记忆 ──────── 跨会话持久化（MEMORY.md、向量库）
└─ 共享记忆 ──────── 跨 Agent 可访问（团队知识库）
```

### AGENTS.md / MEMORY.md 模式

一种基于文件的记忆模式，由 OpenClaw 和 Claude Code 推广：

- **AGENTS.md** — Agent 配置、人格、规则（每次会话读取）
- **MEMORY.md** — 策划过的长期记忆（Agent 读取 + 更新）
- **memory/YYYY-MM-DD.md** — 每日原始日志（只追加）

这个模式简单、可移植、可版本控制 — Agent 的记忆存在纯文本文件里，人类可以阅读和编辑。

---

## Skill / 工具编排 (Skill Orchestration)

Skill（也叫 tools、plugins、capabilities）让 Agent 的能力超越纯文本生成。

### 设计模式

| 模式 | 描述 | 示例 |
|------|------|------|
| **Thin harness + thick skills** | Harness 最小化；Skill 承载复杂性 | OpenClaw skills |
| **Thick harness + thin tools** | Harness 内置逻辑；工具很简单 | Claude Code 内置工具 |
| **Plugin 市场** | 社区贡献的 Skill | OpenClaw Skill Gallery |

---

## Agent 生命周期 (Agent Lifecycle)

Agent 经历不同阶段。Harness 管理它们之间的转换。

```
启动 → 初始化 → 活跃 → [暂停] → 关闭
 │        │       │       │
 │        │       │       └── 心跳 / 唤醒
 │        │       └── 处理消息、执行任务
 │        └── 加载记忆、读配置、检查权限
 └── 启动运行时、验证环境
```

---

## 多 Agent 协调 (Multi-Agent Coordination)

当多个 Agent 协同工作时，harness 变成编排器。

### 协调模式

| 模式 | 描述 | 适用场景 |
|------|------|---------|
| **Hub-and-spoke** | 一个协调器分派给专业 Agent | 任务分解 |
| **Peer-to-peer** | Agent 直接通信 | 协作编辑 |
| **Pipeline** | Agent A 的输出喂给 Agent B | 顺序处理 |
| **Swarm** | 多个 Agent 独立处理子任务 | 并行探索 |

---

*下一篇：[架构模式 →](patterns.md)*
