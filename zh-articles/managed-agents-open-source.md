# Claude Managed Agents 开源复刻

> **Original**: [Tweet](https://x.com/berryxia/status/2042016446243631328) · Berryxia ([@berryxia](https://x.com/berryxia)) · April 8, 2026
> **Engagement**: 346 likes · 63 retweets · 55K views · 643 bookmarks
> **Category**: Open Source / Implementation

---

## Overview

Claude Managed Agents 官宣没几个小时，Berryxia 就宣布了开源版本：完整复刻 Claude Managed Agents 核心能力的生产就绪 Agent harness + 基础设施。

---

## What Claude Managed Agents Is

indigo ([@indigox](https://x.com/indigox)) 在 [另一条推文](https://x.com/indigox/status/2042047463562080483) 中做了精准拆解：

**三个核心概念：**
- **Agent** — 有版本的配置（模型、系统提示、工具、Skills、MCP 服务器），创建一次，通过 ID 引用
- **Environment** — 描述沙盒的模板：运行时类型、网络策略、包配置等
- **Session** — 用预创建 Agent 配置的有状态运行

**四个常见场景：**
1. **事件触发** — bug 被标记 → Agent 写补丁 + 开 PR，全程无人干预
2. **定时任务** — 每日活动摘要、团队进展报告
3. **Fire-and-forget** — Slack 分配任务 → 收到电子表格/PPT/应用
4. **长时任务** — Agent 长时间自主探索（Karpathy 的 AutoResearch 变体）

---

## Why Open-Source Matters

> *"Anthropic 一个上新估计又要干掉 100 家 Agent Harness 创业公司"* — indigo

Managed Agents 解决了企业部署 Agent 的最大痛点 — 不是模型，而是"如何在生产环境中可靠地运行 Agent，并跟上模型的更新"。

开源版本的意义在于：让这个能力不被 Anthropic 独占。

---

*See also: [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md) · [Architecture Patterns](../guide/patterns.md)*
