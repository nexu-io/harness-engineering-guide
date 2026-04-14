# Deux: Swift → Kotlin — Harness 驱动的跨平台代码转换

> **原文**: [Tweet](https://x.com/hwwaanng/status/2040064208461762993) · Hwang ([@hwwaanng](https://x.com/hwwaanng)) · April 3, 2026
> **Engagement**: 655 likes · 74 retweets · 142K views · 887 bookmarks
> **分类**: Practice / Case Study

---

## 概述

Hwang 构建了一套 Harness 系统，能把任意 Swift codebase 自动转换成原生 Kotlin 的 Android 项目。用户只需启动 App，然后等待数小时。

> *"很多人还是低估了今天模型的能力。也低估了 Harness Engineering。"*

---

## How It Works

```
启动 App
  → AI 查看代码、查看交互
    → 记笔记、写测试
      → 不断创建 Sub Agent 加速
        → 自我验证、自我迭代
          → 输出：高度可用的 Android App
```

关键特点：
- **自我验证**：Agent 会实际运行转换后的代码并测试
- **自我迭代**：发现问题后自动修复，不需要人类干预
- **Sub Agent 加速**：自动创建子 Agent 并行处理不同模块
- **全程无人值守**：启动后数小时自主完成

---

## Why It Matters

这是 Harness Engineering 实际落地的标杆案例之一：

1. **证明了 harness 设计比模型选择更重要** — 同样的模型，没有这套 harness 根本无法完成跨平台转换
2. **展示了 multi-agent 在真实场景中的价值** — 不是演示，而是可以交付的产品
3. **自我验证循环**是关键 — 与 Anthropic 的 Generator + Evaluator 模式异曲同工

---

*See also: [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md) · [Meta-Harness: Automated Optimization](meta-harness-automated-optimization.md)*
