# 2-Hour Harness Engineering Speedrun: Building a Claude Code Agent from Scratch

> **Original**: [WeChat — LongjingAgent](https://mp.weixin.qq.com/s/WTD0TEKn0h_vjgNR1WGSxQ) · LongjingAgent · 2026-04-01
> **Category**: Tutorial / Practice
> **Reference**: [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)

---

## Overview

A 12-chapter walkthrough of building a Claude Code-like agent system from scratch using Harness Engineering principles. Based on the open-source learn-claude-code project. Core thesis: don't "develop" agents — build them a good working environment.

## Core Philosophy

> Harness = Tools + Knowledge + Context Management + Permission Boundaries
>
> The model is the driver, the Harness is the car. You don't need to teach the driver how to drive — you just need to build a good car.

## 12 Lessons at a Glance

| Phase | Lesson | What | Problem Solved |
|-------|--------|------|----------------|
| **Get it running** | S01 | Agentic Loop | Agent can operate |
| | S02 | Toolbox + Fences | Can work, with boundaries |
| **Make it work well** | S03 | Todo List | Prevents attention drift |
| | S04 | Sub-agents | Context isolation + division of labor |
| | S05 | Skill Loading | On-demand knowledge, menu-first |
| | S06 | 3-Layer Context Compression | Infinite conversations without overflow |
| **Make it remember** | S07 | Task System (dependency graph) | Tasks persist across restarts |
| | S08 | Background Tasks | No idle waiting, async parallel |
| **Make it lead teams** | S09 | Team + Inbox | Multi-agent collaboration |
| | S10 | Communication Rules | Graceful shutdown, approval workflows |
| | S11 | Autonomy | Self-claiming tasks, auto-shutdown on idle |
| | S12 | Worktree Isolation | Git worktree per task, no conflicts |

## Key Design Insights

### The Agentic Loop (S01)
Starts with just 30 lines of code: the agent calls tools iteratively until it decides it's done. All 11 subsequent lessons add mechanisms on top of this loop — **the loop itself never changes**.

### Toolbox Design (S02)
- **Registry**: Unregistered tools are invisible and inaccessible
- **Fencing**: File tools restricted to project directory only
- **Extensible**: Adding tools requires zero changes to the loop

### 3-Layer Context Compression (S06)
1. **Auto-decay**: Tool outputs older than 3 turns replaced with markers like `[Previous: used read_file]`
2. **Threshold compression**: Token limit hit → full conversation saved to disk → model generates summary → summary replaces history
3. **Manual compression**: Agent can proactively trigger compression when context feels cluttered

### Skill On-Demand Loading (S05)
- **Boot time**: Scan all SKILL.md files, inject only name + description (~dozens of tokens)
- **Runtime**: `load_skill` tool loads full content only when needed (~thousands of tokens)
- Core idea: **Show the menu at boot, serve the full recipe only when ordered**

### Task Dependency Graph (S07)
Each task stored as a separate JSON file. Three states: pending, in_progress, completed. `blockedBy` list manages dependencies. Completing a task automatically unblocks downstream tasks.

### Multi-Agent Collaboration (S09-S12)
- Lead agent creates teammates, each with independent thread and loop
- File-folder inbox system for message passing
- Request-response + unique ID pattern for shutdown and approval
- Auto-claiming: idle agents poll taskboard every 5s, auto-shutdown after 60s of inactivity
- Git worktree isolation: task controls "what to do", worktree controls "where to do it"

## Key Takeaway

> Starting point: 30 lines of code. End point: a complete system with tools, memory, teams, and autonomy. Throughout, those few lines of loop code never changed — everything that changed was the Harness.

---

*Based on LongjingAgent's WeChat article. Original: [LongjingAgent](https://mp.weixin.qq.com/s/WTD0TEKn0h_vjgNR1WGSxQ). Reference project: [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code).*
