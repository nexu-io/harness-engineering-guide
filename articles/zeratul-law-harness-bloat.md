# Zeratul's Law: Agent Harness Bloat

> **Original**: [Tweet](https://x.com/z3ratul163071/status/2042831408226304279) · z3ratul ([@z3ratul163071](https://x.com/z3ratul163071)) · April 11, 2026
> **Category**: Industry Perspective / Hot Take

---

## The Law

> *"Every agent harness will bloat to become unusable within 2 months of hitting the GitHub exponential."*

z3ratul 在观察到 Hermes Agent（70K stars）启动时间竟然需要 2 分钟后，提出了这条"定律"。

---

## The Pattern

1. 项目发布，精简好用
2. GitHub star 进入指数增长期
3. 社区贡献蜂拥而入 — 功能请求、插件、集成
4. 2 个月内，启动变慢、配置变复杂、bug 频发
5. 用户开始寻找下一个"精简好用"的替代品

这与卡颂（[@kasong2048](https://x.com/kasong2048)）观察到的 [Skill 膨胀问题](skill-explosion-consolidation.md) 本质相同：增长带来复杂性，复杂性吞噬可用性。

---

## Counterpoint

Anthropic 的 harness 组件生命周期管理提供了一种解法：**定期移除不再需要的组件**。但这需要纪律，而开源社区天然倾向于"加功能"而非"减功能"。

Ralph 的极简哲学是另一种回应：从一开始就不加多余的东西，就不存在膨胀的问题。

---

*See also: [Skill 膨胀与框架整合](skill-explosion-consolidation.md) · [Ralph: Simple Harness Loop](ralph-simple-harness-loop.md)*
