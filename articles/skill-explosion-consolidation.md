# Skill 膨胀与 Harness 框架整合

> **Original**: [Tweet](https://x.com/kasong2048/status/2038599301618889042) · 卡颂 ([@kasong2048](https://x.com/kasong2048)) · March 30, 2026
> **Engagement**: 464 likes · 41 retweets · 68K views · 558 bookmarks
> **Category**: Industry Perspective / Practice

---

## The Problem

> *"很多程序员的 Skill 数量已经失控了。"*

卡颂观察到一个普遍现象：开发者今天装 superpowers，明天又被安利 compound-engineering，后天跟风装 gstack。Skill 数量瞬间膨胀到几十个，Skill 之间的跳转、召回逻辑变得无比不稳定。

### 根本原因

这些框架都是对 Harness Engineering 最佳实践的探索，各自有亮点，但能力有交集。当前 Skill 管理工具的思路都是"屏蔽复杂度"（启用/停用某个 Skill），而不是"降低复杂度"。

---

## 卡颂的解法

以一个框架为基础，把其他框架的亮点**合并**进来，而非并行安装：

```
选定基础框架（如 superpowers）
  → 识别其他框架的独特亮点（如 compound 的持续学习）
    → 用 Skill 来合并、测试其他 Skill
      → 控制 Skill 数量的膨胀速度
```

关键洞察：**用 Skill 来管理 Skill**。合并和测试的工作本身也由 Agent 完成。

---

## Why It Matters

Skill 膨胀是 Harness Engineering 面临的一个系统性问题：

1. **发现成本低** — 安装一个 Skill 太容易了
2. **移除成本高** — 你不确定移除后会不会出问题
3. **交互测试难** — Skill A 和 Skill B 的组合行为难以预测

这与 [Zeratul's Law](zeratul-law-harness-bloat.md) 描述的 harness 膨胀是同一个问题的不同表现形式。一个发生在 harness 层面，一个发生在 skill 层面。

---

*See also: [Zeratul's Law: Harness Bloat](zeratul-law-harness-bloat.md) · [Architecture Patterns](../guide/patterns.md)*
