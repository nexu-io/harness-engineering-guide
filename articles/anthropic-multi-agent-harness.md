# Anthropic: Multi-Agent Harness Design for Long-Running Applications

> **Original**: [anthropic.com/engineering/harness-design-long-running-apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) · Prithvi Rajasekaran, Anthropic Labs · March 2026
> **Category**: Official / Foundational

---

## Overview

Anthropic's engineering team tackles a specific problem: how do you keep an AI agent reliable and on-track during **multi-hour autonomous coding sessions**? Their answer is a multi-agent architecture inspired by GANs (Generative Adversarial Networks) — split the agent into a Generator that builds and an Evaluator that judges.

This article is the foundational text for **Time Scalability** in harness engineering: making a single agent work reliably over long periods.

---

## The Two Failure Modes

Anthropic identifies two problems that environment design alone cannot prevent:

### 1. Direction Drift (Context Anxiety)

As the context window fills up, the model loses coherence:
- Forgets early constraints
- Drifts from the original direction
- Dives deeper into irrelevant details
- **Context anxiety**: starts wrapping up work prematurely when approaching what it believes is the context limit

**Solution: Context Reset, not Compaction**

Compaction (summarizing old conversation) preserves continuity but doesn't give the agent a clean slate. Context anxiety persists.

Context reset clears the entire context window and starts a fresh agent with a **structured handoff artifact** — enough state for the new agent to continue cleanly. More expensive in orchestration, but fundamentally more reliable.

### 2. Self-Evaluation Blindness

When asked to evaluate their own work, agents **consistently praise it** — even when the quality is mediocre. This is especially severe for subjective tasks (design, UX), but even occurs in tasks with verifiable outcomes.

**Solution: Separate Generator and Evaluator**

Splitting "doing" and "judging" into two independent agents is the key lever. The evaluator doesn't share internal state with the generator, which is what makes honest judgment possible. Then tuning the evaluator to be **skeptical by default** becomes tractable.

---

## The Three-Agent Architecture

```
User Requirement (one sentence)
         │
         ▼
    ┌─────────┐
    │ Planner  │  Expands requirement → full product spec
    │          │  Product-level design only, no implementation details
    └────┬────┘
         │ spec
         ▼
    ┌─────────┐
    │Generator │  Implements features sprint-by-sprint
    │          │  Context reset between sprints
    └────┬────┘
         │ output
         ▼
    ┌─────────┐
    │Evaluator │  Uses Playwright to interact with the running app
    │          │  Grades against sprint contract
    │          │  Strict by default
    └────┬────┘
         │ pass/fail
         ▼
    Pass → Next sprint
    Fail → Generator iterates
```

### Key Design Choices

- **Planner deliberately avoids implementation details** — specifying technical details too early causes error cascading
- **Evaluator uses Playwright to test the real running app** — not just reading code, but clicking buttons and checking UI
- **5–15 iteration rounds** per evaluator cycle
- **Sprint contract** defines clear acceptance criteria per cycle

---

## The Experiment: Digital Audio Workstation

The architecture produced a complete digital audio workstation:
- **Runtime**: ~4 hours
- **Cost**: $124
- **Generator first run**: 2 hours 7 minutes continuous
- **Baseline comparison**: Same prompt, single agent, 20 minutes, $9 — core features non-functional

The 13x cost increase bought a qualitative leap from "doesn't work" to "complete and functional."

---

## The Most Important Insight: Harness Components Have Expiration Dates

> *"Every harness component encodes a hypothesis about what the current model can't do."*

Each component has a different expiration speed:

| Component | Hypothesis | Status (Opus 4.6) |
|-----------|-----------|-------------------|
| Context reset | Model can't maintain coherence in long context | ❌ Retired |
| Sprint decomposition | Model can't maintain direction in long sessions | ❌ Retired |
| Evaluator | Model overrates its own work | ✅ Still valuable |

When a new model releases, the correct action is to **remove old components and test whether quality actually drops** — not to keep stacking new components on top.

---

## Why This Matters

This article introduces three ideas that are becoming foundational:

1. **Time Scalability** as a distinct dimension of harness engineering
2. **Adversarial evaluation** as a general-purpose quality mechanism
3. **Harness component lifecycle management** — the discipline of removing components when models outgrow them

The GAN-inspired approach (generator + evaluator) has since been adopted by multiple open-source harness implementations.

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Wayne Zhang: Three Scaling Dimensions](wayne-zhang-scaling-dimensions.md)*
