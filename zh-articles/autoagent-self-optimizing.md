# AutoAgent: 第一个会自我优化的 Agent

> **原文**: [Tweet](https://x.com/servasyy_ai/status/2040411682355511646) · huangserva ([@servasyy_ai](https://x.com/servasyy_ai)) · April 4, 2026
> **引用**: Kevin Gu ([@kevingu](https://x.com/kevingu)) — [Tweet](https://x.com/kevingu/status/2039843234760073341)
> **分类**: Research / Practice

---

## 概述

AutoAgent 可能是全球第一个"会自我优化的 Agent"开源项目。24 小时自主优化后：

| 基准测试 | 得分 | 排名 |
|---------|------|------|
| SpreadsheetBench | 96.5% | **#1** |
| TerminalBench | 55.1% | **#1** |

所有其他榜单上的成绩都是手工调的。AutoAgent 的不是。

---

## How It Works

核心机制对应 Harness Engineering 的三个关键概念：

1. **评估闭环** — Meta-Agent 读取失败轨迹，改写 harness
2. **架构约束** — 自动生成验证循环和格式校验器
3. **记忆治理** — 24 小时迭代积累轨迹，形成可复用的经验

### Model Empathy（模型共情）

一个有趣的发现：Claude meta + Claude task 比 Claude meta + GPT task 效果好。因为**同模型更懂对方怎么想**。这印证了一个 harness 设计原则：约束越多反而越可靠。

---

## Why It Matters

AutoAgent 把 [Meta-Harness](meta-harness-automated-optimization.md) 的理论变成了现实：

> *"Harness Engineering 的三件事 — 评估闭环、架构约束、记忆治理 — 当时更多是理论推演。AutoAgent 把这三件事全做了。而且是 Agent 自己做的。"*

这预示了 Harness Engineering 的未来方向：不是人来优化 harness，而是 Agent 自己优化自己的 harness。

---

*See also: [Meta-Harness: Automated Optimization](meta-harness-automated-optimization.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
