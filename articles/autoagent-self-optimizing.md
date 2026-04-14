# AutoAgent: The First Self-Optimizing Agent

> **Original**: [Tweet](https://x.com/servasyy_ai/status/2040411682355511646) · huangserva ([@servasyy_ai](https://x.com/servasyy_ai)) · April 4, 2026
> **Quoted**: Kevin Gu ([@kevingu](https://x.com/kevingu)) — [Tweet](https://x.com/kevingu/status/2039843234760073341)
> **Category**: Research / Practice

---

## Overview

AutoAgent may be the world's first open-source project featuring a "self-optimizing agent." After 24 hours of autonomous optimization:

| Benchmark | Score | Rank |
|-----------|-------|------|
| SpreadsheetBench | 96.5% | **#1** |
| TerminalBench | 55.1% | **#1** |

All other scores on these leaderboards were manually tuned. AutoAgent's were not.

---

## How It Works

The core mechanism maps to three key concepts in Harness Engineering:

1. **Evaluation Loop** — A Meta-Agent reads failure trajectories and rewrites the harness
2. **Architectural Constraints** — Automatically generates validation loops and format checkers
3. **Memory Governance** — 24-hour iterative accumulation of trajectories, forming reusable experience

### Model Empathy

An interesting finding: Claude meta + Claude task outperforms Claude meta + GPT task. Because **the same model understands how the other thinks better**. This confirms a harness design principle: more constraints actually lead to more reliability.

---

## Why It Matters

AutoAgent turns the theory of [Meta-Harness](meta-harness-automated-optimization.md) into reality:

> *"The three pillars of Harness Engineering — evaluation loops, architectural constraints, memory governance — were originally more theoretical. AutoAgent implemented all three. And the agent did it on its own."*

This points to the future direction of Harness Engineering: not humans optimizing harnesses, but agents optimizing their own harnesses.

---

*See also: [Meta-Harness: Automated Optimization](meta-harness-automated-optimization.md) · [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md)*
