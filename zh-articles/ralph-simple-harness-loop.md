# Ralph: 简单高效的 Harness Loop

> **Repo**: [github.com/snarktank/ralph](https://github.com/snarktank/ralph)
> **Discussed by**: Wayne Zhang ([@wayne_zhang0](https://x.com/wayne_zhang0)) — [Tweet](https://x.com/wayne_zhang0/status/2042874483606983079), 729 likes, 1162 bookmarks
> **Category**: Tool / Framework

---

## Overview

Wayne Zhang（写出"Harness Engineering 最好文章"的那位）在调研了大量 harness 框架后，推荐了 Ralph：

> *"调研了半天现有的 harness engineering 框架，还不如 ralph loop，简单好用、直接高效，不容易漂移，也不污染上下文。"*

Ralph 是一个极简的 agent 循环框架，核心理念是：不做多余的事。

---

## Design Philosophy

| 传统 harness 框架 | Ralph |
|------------------|-------|
| 复杂的配置系统 | 最小配置 |
| 多层抽象 | 直接调用 |
| 上下文膨胀 | 不污染上下文 |
| 容易漂移 | 稳定不漂移 |

Ralph 的名字来自 "Ralph Wiggum Loop" — 一个在 OpenAI 和 Anthropic 的文章中都被引用的概念：让 agent 在一个自我验证的循环中持续迭代，直到满意。

---

## The Ralph Wiggum Loop

这个模式最早由 [Geoffrey Huntley](https://ghuntley.com/ralph/) 提出，后来被 OpenAI（Harness Engineering 博客）和 Anthropic（Multi-Agent Harness 博客）同时引用：

```
Agent 执行任务
  → Agent 自我 review
    → 不满意 → 再来一轮
    → 满意 → 提交结果
```

Ralph 把这个循环做成了一个可以直接使用的工具，没有多余的抽象层。

---

## Why It Matters

Ralph 代表了一种反主流的 harness 设计哲学：**简单就是最好的 harness**。在很多开发者追求功能丰富的 harness 框架时，Ralph 证明了一个极简循环往往比复杂系统更可靠。

这也呼应了 Anthropic 的发现：harness 组件有过期日，好的工程师会不断移除不再需要的组件。Ralph 从一开始就没有多余的组件可以移除。

---

*See also: [Wayne Zhang: Three Scaling Dimensions](wayne-zhang-scaling-dimensions.md) · [OpenAI: Harness Engineering](openai-harness-engineering.md)*
