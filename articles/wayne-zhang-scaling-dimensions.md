# Wayne Zhang: Harness Engineering 的三个 Scaling 维度

> **Original**: [yage.ai/share/harness-engineering-scalability-20260330.html](https://yage.ai/share/harness-engineering-scalability-20260330.html) · Wayne Zhang ([@wayne_zhang0](https://x.com/wayne_zhang0)) · March 30, 2026
> **Also**: [Tweet](https://x.com/wayne_zhang0/status/2039809144254058691) — 742 likes, 1299 bookmarks
> **Category**: Deep Dive / Analysis

---

## Overview

Wayne Zhang 写了被社区称为"目前写 harness engineering 写得最好的文章"。核心贡献是提出了一个 **统一框架**，解释了为什么 OpenAI、Anthropic、Cursor 三篇同时期发布的文章用同一个术语 "harness engineering" 却在讨论完全不同的事。

**答案：Harness Engineering 的本质是让 AI 构建软件变得 scalable，而 scalability 有三个独立的维度。三家各自解了其中一个。**

---

## The Three Scaling Dimensions

### 1. Time Scalability — Anthropic

**问题**：一个 agent 连续跑几小时，怎么保持方向和质量？

Anthropic 的三角色架构（Planner → Generator → Evaluator）解决的是运行时纠偏。每个 harness 组件都是对当前模型能力边界的一个假设，这些假设有不同的过期速度。

> *从 Sonnet 4.5 到 Opus 4.6，context reset 先被淘汰，sprint 分解随后被淘汰，evaluator 仍然有价值。*

### 2. Space Scalability — Cursor

**问题**：能否通过投入 10 倍的计算来获得 10 倍的有意义吞吐量？

Cursor 从零构建了一个 Rust 浏览器引擎，数百个 agent 并行运行一周，生成超过一百万行代码。文章记录了四次架构迭代的失败过程：

| 迭代 | 架构 | 结果 |
|------|------|------|
| v1 | 所有 agent 平等 + 共享状态 | 锁竞争，20 个 agent 退化到 1-3 个水平 |
| v2 | Planner/Executor/Worker/Judge | 改善但被最慢 Worker 瓶颈 |
| v3 | Planner 合并进 Executor | 角色过载：随机休眠、停止生成任务 |
| **v4** | **递归 Planner-Worker** | **线性扩展，峰值 ~1000 commits/hour** |

最终架构的关键：Worker 之间完全隔离，信息严格向上流动。

### 3. Interaction Scalability — OpenAI

**问题**：当 agent 的产出速度远超人类注意力时，人应该通过什么界面来 steer？

OpenAI 的答案从"写 prompt 触发 Codex"演进到 [Symphony](https://github.com/openai/symphony)：一个持久化守护进程，把 Linear ticket 变成自动化 agent run。

人类的交互被简化为：上游写 ticket + 维护 harness，下游 review Proof of Work。中间的执行过程完全自主。

---

## The Four Consensus Points

在分化为三个维度之前，三家收敛到了四条共识 — 这是 harness engineering 最没有争议的部分：

1. **人类的核心工作从写代码转向设计 agent 的工作环境**
2. **知识必须版本化、可发现、存在于 repo 中** — Codex 看不到的等于不存在
3. **约束比指令有效** — 约束是可执行的、确定性的；指令是可解释的、模糊的
4. **完美主义是吞吐量的敌人** — 纠错比等待便宜

> *"任何一篇讨论 harness engineering 的文章，如果连这四条都没有涉及，大概率还在讨论别的东西。"*

---

## Why This Matters

Wayne Zhang 的文章之所以被社区高度认可，是因为它：

1. **拆解了术语混乱** — 同一个词为什么在不同文章里指代不同的东西
2. **提供了评判标准** — 四条共识可以用来快速判断一篇 harness engineering 文章的深度
3. **预测了未来方向** — 三个维度各自独立发展，但最终需要统一

这是理解 Harness Engineering 当前全景的最佳入口之一。

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
