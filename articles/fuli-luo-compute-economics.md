# Fuli Luo: Anthropic 切掉第三方 Harness 订阅 — 算力经济分析

> **Original**: [Tweet](https://x.com/_LuoFuli/status/2040825059342721520) · Fuli Luo ([@_LuoFuli](https://x.com/_LuoFuli)) · April 5, 2026
> **Engagement**: 1,770 likes · 222 retweets · 733K views
> **Category**: Industry Perspective

---

## Background

2026 年 4 月初，Anthropic 切断了第三方 harness（如 OpenClaw、OpenCode）使用 Claude 订阅的能力。几乎同时，MiMo 推出了 Token Plan。罗福莉（Fuli Luo）将这两件事放在一起分析，提出了对 Agent 时代算力经济的深度思考。

---

## Core Arguments

### 1. Claude Code 订阅是精巧的算力分配设计

Claude Code 的订阅系统大概率不赚钱，甚至在流血。第三方 harness 接入后，真实成本可能是订阅价格的 **数十倍**。

> 罗福莉分析了 OpenClaw 的上下文管理：在单次用户查询中，它会发起多轮低价值的 tool calls 作为独立 API 请求，每轮携带超过 100K tokens 的长上下文。即使有 cache hits，也很浪费；极端情况下还会推高其他查询的 cache miss rate。

### 2. 短期阵痛 → 长期工程纪律

第三方 harness 仍然可以通过 API 调用 Claude — 只是不能再搭便车订阅了。短期内用户成本跳涨数十倍。但这个压力正是推动 harness 改进上下文管理、最大化 prompt cache hit rate、减少无效 token 消耗的动力。

> *"Pain eventually converts to engineering discipline."*

### 3. 不要在赔钱的定价上竞速

罗福莉呼吁 LLM 公司不要盲目打价格战。把 token 卖得很便宜又对第三方 harness 大开方便门，看起来对用户友好，但这是个陷阱 — 正是 Anthropic 刚走出来的陷阱。

更深层的问题：如果用户把注意力消耗在低质量的 agent harness、不稳定的推理服务、和降级模型上，最终什么都做不好 — 这对用户体验和留存率都是负循环。

### 4. 协同进化论

> *"The Agent era doesn't belong to whoever burns the most compute. It belongs to whoever uses it wisely."*

全球算力跟不上 Agent 产生的 token 需求。真正的出路不是更便宜的 token，而是协同进化：

```
更高效的 Agent Harness  ×  更强大更高效的模型
```

Anthropic 的这步棋，无论是否有意为之，正在推动整个生态系统 — 开源和闭源 — 都朝着这个方向走。

---

## Why This Matters for Harness Engineering

这篇分析揭示了 Harness Engineering 的一个经常被忽略的维度：**效率**。

Harness 不只是要让 agent 能力更强、运行更久、协调更多 agent — 它还必须让 agent **更省**。上下文管理的质量直接影响 API 成本，而 API 成本是 Agent 产品能否商业化的关键。

当模型提供商开始按照上下文效率来区分定价（或直接拒绝低效 harness），优化 harness 的 token 消耗就不再是可选项，而是生存问题。

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
