# Wayne Zhang: Three Scaling Dimensions of Harness Engineering

> **Original**: [yage.ai/share/harness-engineering-scalability-20260330.html](https://yage.ai/share/harness-engineering-scalability-20260330.html) · Wayne Zhang ([@wayne_zhang0](https://x.com/wayne_zhang0)) · March 30, 2026
> **Also**: [Tweet](https://x.com/wayne_zhang0/status/2039809144254058691) — 742 likes, 1299 bookmarks
> **Category**: Deep Dive / Analysis

---

## Overview

Wayne Zhang wrote what the community calls "the best article on harness engineering to date." His core contribution is a **unified framework** explaining why OpenAI, Anthropic, and Cursor published three articles at the same time using the same term "harness engineering" yet discussing completely different things.

**The answer: The essence of Harness Engineering is making AI-driven software development scalable, and scalability has three independent dimensions. Each company addressed one of them.**

---

## The Three Scaling Dimensions

### 1. Time Scalability — Anthropic

**Problem**: How do you maintain direction and quality when an agent runs continuously for hours?

Anthropic's three-role architecture (Planner → Generator → Evaluator) addresses runtime course correction. Each harness component encodes an assumption about the current model's capability boundaries, and these assumptions expire at different rates.

> *From Sonnet 4.5 to Opus 4.6, context reset was deprecated first, sprint decomposition followed, while the evaluator still retains value.*

### 2. Space Scalability — Cursor

**Problem**: Can you achieve 10× meaningful throughput by investing 10× compute?

Cursor built a Rust browser engine from scratch, running hundreds of agents in parallel for a week, generating over one million lines of code. The article documents four failed architectural iterations:

| Iteration | Architecture | Result |
|-----------|-------------|--------|
| v1 | All agents equal + shared state | Lock contention, 20 agents degraded to 1-3 level |
| v2 | Planner/Executor/Worker/Judge | Improved but bottlenecked by slowest Worker |
| v3 | Planner merged into Executor | Role overload: random sleeping, stopped generating tasks |
| **v4** | **Recursive Planner-Worker** | **Linear scaling, peak ~1000 commits/hour** |

The key to the final architecture: complete isolation between Workers, with information strictly flowing upward.

### 3. Interaction Scalability — OpenAI

**Problem**: When agent output speed far exceeds human attention, what interface should humans use to steer?

OpenAI's answer evolved from "write a prompt to trigger Codex" to [Symphony](https://github.com/openai/symphony): a persistent daemon that turns Linear tickets into automated agent runs.

Human interaction is simplified to: writing tickets upstream + maintaining the harness, reviewing Proof of Work downstream. The execution in between is fully autonomous.

---

## The Four Consensus Points

Before diverging into three dimensions, all three companies converged on four consensus points — the least controversial aspects of harness engineering:

1. **The core human role shifts from writing code to designing the agent's working environment**
2. **Knowledge must be versioned, discoverable, and exist in the repo** — What Codex can't see doesn't exist
3. **Constraints are more effective than instructions** — Constraints are executable and deterministic; instructions are interpretable and ambiguous
4. **Perfectionism is the enemy of throughput** — Correction is cheaper than waiting

> *"Any article discussing harness engineering that doesn't touch on these four points is probably discussing something else entirely."*

---

## Why This Matters

Wayne Zhang's article earned high recognition from the community because it:

1. **Untangled the terminology confusion** — Why the same word means different things in different articles
2. **Provided evaluation criteria** — The four consensus points can quickly assess the depth of any harness engineering article
3. **Predicted future directions** — The three dimensions evolve independently but will eventually need to be unified

This is one of the best entry points for understanding the current landscape of Harness Engineering.

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
