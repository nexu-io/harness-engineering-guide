# Skill Explosion and Harness Framework Consolidation

> **Original**: [Tweet](https://x.com/kasong2048/status/2038599301618889042) · Kasong ([@kasong2048](https://x.com/kasong2048)) · March 30, 2026
> **Engagement**: 464 likes · 41 retweets · 68K views · 558 bookmarks
> **Category**: Industry Perspective / Practice

---

## The Problem

> *"Many programmers' Skill counts have gotten completely out of control."*

Kasong observed a widespread phenomenon: developers install superpowers today, get talked into compound-engineering tomorrow, and follow the trend with gstack the day after. Skill counts balloon to dozens in no time, and the switching and recall logic between Skills becomes incredibly unstable.

### Root Cause

These frameworks are all explorations of Harness Engineering best practices, each with highlights, but with overlapping capabilities. Current Skill management tools take the approach of "hiding complexity" (enable/disable a Skill), rather than "reducing complexity."

---

## Kasong's Solution

Use one framework as the foundation and **merge** highlights from other frameworks into it, rather than installing them in parallel:

```
Select base framework (e.g., superpowers)
  → Identify unique highlights from other frameworks (e.g., compound's continuous learning)
    → Use Skills to merge and test other Skills
      → Control the rate of Skill count explosion
```

Key insight: **Use Skills to manage Skills**. The merging and testing work itself is also done by the Agent.

---

## Why It Matters

Skill explosion is a systemic problem facing Harness Engineering:

1. **Low discovery cost** — Installing a Skill is too easy
2. **High removal cost** — You're not sure if removing it will cause problems
3. **Hard interaction testing** — The combined behavior of Skill A and Skill B is hard to predict

This is a different manifestation of the same problem described in [Zeratul's Law](zeratul-law-harness-bloat.md) about harness bloat. One occurs at the harness level, the other at the skill level.

---

*See also: [Zeratul's Law: Harness Bloat](zeratul-law-harness-bloat.md) · [Architecture Patterns](../guide/patterns.md)*
