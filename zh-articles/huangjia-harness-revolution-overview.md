# 万字综述 Harness 革命

> **原文**: [微信公众号 Datawhale](https://mp.weixin.qq.com/s/0CTwb4aEr5mWwsdRdwzwkw) · 黄佳 · 2026-04-13
> **分类**: 综述 / 基础

---

## 概述

新加坡科研机构 AI 研究员、《动手做AI Agent》《Agent设计模式》作者黄佳在 Datawhale 带来了一场关于 Agent Harness 的深度分享。在 2026 年，当大模型能力进入高原期，Harness 正在成为决定 Agent 系统成败的关键。

## 2026 年的关键转折：从拼模型到拼 Harness

我们现在在 2026 年这个时间节点，当模型的能力进入高原期——模型智力已经在线、过关了。无论是中国的还是外国的模型都可以。

**我们现在比拼的是 Harness。**

DeepMind 的 Agents 团队做的实验很有名：用同一个模型，只换 Harness、换模型的外围，性能就能够产生巨大的差异。Claude Code 本身现在进步这么快，它的商业价值也如日中天，都表明 Harness 是战略级别的资产。

## Harness 的历史必然性：30 年软件工程的启示

Harness 的出现不是偶然，而是历史的必然。工程师一直都在跟系统的复杂度做斗争。**技术架构演进二十几年不变的核心就是：如何驾驭复杂性。**

| 年代 | 驾驭目标 | 代表作 |
|------|---------|--------|
| 1994 | 对象的复杂性 | GOF《Design Patterns》23 种设计模式 |
| 2002 | 企业架构的复杂性 | Martin Fowler《企业应用架构模式》、Eric Evans《DDD》 |
| 2010 | 分布式系统的复杂性 | 微服务、消息队列、最终一致性 |
| 2017 | 数据系统的复杂性 | Martin Kleppmann《DDIA》 |
| **2026** | **智能体的复杂性** | **Harness Engineering** |

Agent 是第一个不确定性系统——它是概率机器，输入一个东西不一定按你的要求走。**Harness 就是我们驾驭 Agent 的缰绳。**

## 从 Prompt 到 Context 再到 Harness：三次跃迁

| 阶段 | 时间 | 核心 |
|------|------|------|
| Prompt Engineering | 2023 | 如何让大模型理解我们（CoT、Few-shot） |
| Context Engineering | 2024-2025 | 给大模型什么 = 从大模型得到什么（RAG、知识库） |
| **Harness Engineering** | **2026** | 设计可控的 Agent 系统（循环策略、工具、质量审核、分发治理） |

## Agent = Model + Harness

Harness 就是包裹模型运行的基础设施：

> **Harness 做的就是把大模型的大脑变成了 Agent 的身体。**

### Harness 六大核心组件

1. **Agentic Loop** — 最重要的心脏。接受输入、工具执行、反复运作，最后返回结果。与 ReAct（推理+行动循环）一脉相承。
2. **Tool System** — 工具调用，扩展大模型的行动范围。
3. **Memory & Context Management** — 记忆和上下文管理。Claude Code 在 Context Engineering 方面领先好几条街。
4. **Guardrails** — Allow / Deny / Ask 权限控制，缰绳的核心。
5. **Hooks** — 守卫机制（如防止敏感文件泄露）。
6. **Session** — 会话连续性控制。

### Harness 解决的五大落地难题

1. 无限循环问题
2. 上下文爆炸问题
3. 权限失控问题
4. 质量不可控问题
5. 成本不透明问题

## 当前 Harness 生态格局

| 类型 | 代表 | 定位 |
|------|------|------|
| **纵深型** | Claude Code | 深度工程开发，Harness 的 Number One |
| **纵深型** | Codex (OpenAI) | 开源，GPT 代码能力强，常用于 code review |
| **IDE 型** | Cursor、Windsurf | 编码 IDE，Claude Code 之前流行 |
| **开源平替** | OpenCode | Claude Code 开源版，可配 DeepSeek |
| **横向型** | OpenClaw、Hermes | 自动化运营（WhatsApp、飞书等） |

纵深型做深度工程开发，横向型做自动化运营，两者不冲突。

## 工程师的能力转型

**工程师永远不会失业，但码农可能会失业。**

- 码农：单纯写代码的人 → 会被 Agent 替代
- 工程师：设计并驾驭复杂系统的人 → 不可替代

核心能力：理解系统复杂性 + 抽象和结构化思维 + 驾驭不确定性 + 深度业务理解

> **凡此过往，皆为序章。**

---

*本文基于黄佳在 Datawhale 的分享整理，原文详情请访问 [Datawhale 公众号](https://mp.weixin.qq.com/s/0CTwb4aEr5mWwsdRdwzwkw)。*
