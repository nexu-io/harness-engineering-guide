# Deux: Swift → Kotlin — Harness-Driven Cross-Platform Code Conversion

> **Original**: [Tweet](https://x.com/hwwaanng/status/2040064208461762993) · Hwang ([@hwwaanng](https://x.com/hwwaanng)) · April 3, 2026
> **Engagement**: 655 likes · 74 retweets · 142K views · 887 bookmarks
> **Category**: Practice / Case Study

---

## Overview

Hwang built a harness system that can automatically convert any Swift codebase into a native Kotlin Android project. Users simply start the app and wait a few hours.

> *"Many people still underestimate the capabilities of today's models. And they underestimate Harness Engineering."*

---

## How It Works

```
Start App
  → AI inspects code, inspects interactions
    → Takes notes, writes tests
      → Continuously spawns Sub Agents to accelerate
        → Self-validates, self-iterates
          → Output: A highly usable Android App
```

Key features:
- **Self-validation**: The agent actually runs and tests the converted code
- **Self-iteration**: Automatically fixes issues without human intervention
- **Sub Agent acceleration**: Automatically creates sub-agents to process different modules in parallel
- **Fully unattended**: Completes autonomously within hours of starting

---

## Why It Matters

This is one of the benchmark cases for Harness Engineering in practice:

1. **Proves that harness design matters more than model selection** — The same model cannot complete cross-platform conversion without this harness
2. **Demonstrates the value of multi-agent in real scenarios** — Not a demo, but a deliverable product
3. **Self-validation loops are key** — Echoes Anthropic's Generator + Evaluator pattern

---

*See also: [Anthropic: Multi-Agent Harness Design](anthropic-multi-agent-harness.md) · [Meta-Harness: Automated Optimization](meta-harness-automated-optimization.md)*
