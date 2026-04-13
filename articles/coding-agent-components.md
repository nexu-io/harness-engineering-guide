# Sebastian Raschka: Components of a Coding Agent

> **Original**: [Blog post by Sebastian Raschka](https://x.com/rasbt) · April 4, 2026
> **Discussed by**: ℏεsam ([@Hesamation](https://x.com/Hesamation)) — [Tweet](https://x.com/Hesamation/status/2040453130324709805), 394 likes, 432 bookmarks
> **Category**: Deep Dive / Analysis

---

## Overview

Sebastian Raschka (author of *Machine Learning with PyTorch and Scikit-Learn*) published a write-up on the building blocks behind coding agents. ℏεsam's commentary distilled the key insight:

> *"Harness is often more important than the model. The stack is: LLM → agent → agent harness → coding harness."*

---

## The Six Critical Components

### 1. Repo Context

The first thing a coding agent needs is orientation — understanding the codebase it's working in.

- **What's loaded**: git history, README, workspace structure, AGENTS.md
- **When**: Upfront, at session start
- **Why it matters**: Without repo context, the agent writes code that technically works but doesn't fit the project

### 2. Prompt Cache

A stable prefix that stays constant across turns, so only the session state changes.

- **How**: System prompt + repo context as a fixed prefix → cache hit
- **Impact**: Reduces cost by 50-90% on subsequent turns
- **Design**: Separate what changes (conversation) from what doesn't (system context)

### 3. Tools

Named, validated, permission-gated functions the agent can call.

- **Design principle**: Each tool should do one thing well
- **Permission tiers**: Auto-approve (read), notify (write), require approval (delete, deploy)
- **Validation**: Input/output schemas enforce correct usage

### 4. Context Reduction

As conversations grow, the context window fills. The harness must actively manage this:

- **Clip**: Remove old, irrelevant messages
- **Dedup**: Collapse repeated information
- **Compress**: Summarize verbose tool outputs
- **Strategy**: Keep the most recent and most relevant, discard the rest

### 5. Session Memory

The full transcript of the current session, plus a distilled "working memory" — a running summary of what's been accomplished and what's pending.

- **Full transcript**: Complete history for audit/debug
- **Working memory**: Concise state for the agent ("I've fixed files A and B, still need to update tests")
- **Trade-off**: Full context is accurate but expensive; working memory is cheap but lossy

### 6. Subagents

Bounded child agents that inherit context but have limited scope.

- **Use case**: "Research this API" or "Write tests for this file"
- **Design**: Inherit parent context, constrained permissions, report back results
- **Key constraint**: Subagents should not be able to modify parent state directly

---

## The Stack Model

```
┌─────────────────────────┐
│    Coding Harness        │  ← Repo-specific: linters, test runners, CI
├─────────────────────────┤
│    Agent Harness         │  ← The 6 components above
├─────────────────────────┤
│    Agent                 │  ← Reasoning + tool calling loop
├─────────────────────────┤
│    LLM                   │  ← The model itself
└─────────────────────────┘
```

Each layer adds constraints and capabilities. The model is the foundation, but the harness layers are where product differentiation lives.

---

## Why This Matters

This breakdown gives practitioners a **concrete checklist** for evaluating and building harnesses. If your harness is missing any of these six components, you know where the gap is. The stack model also clarifies why "just swapping the model" rarely fixes fundamental issues — the problem is usually in the harness layer above.

---

*See also: [OpenAI: Harness Engineering](openai-harness-engineering.md) · [Architecture Patterns](../guide/patterns.md)*
