---
author: Nexu
---

# Comparison of Major Harness Implementations

This is a factual comparison of prominent agent harnesses as of mid-2025. The field moves fast — specifics may change, but the architectural patterns are stable.

## Overview Table

| Project | Context Management | Memory | Skills / Tools | Multi-Agent | Open Source |
|---|---|---|---|---|---|
| **OpenClaw** | AGENTS.md-driven context injection. Loads workspace files, skills, and memory on each session. Context compression via summarization. | File-based: MEMORY.md (long-term), daily logs (memory/YYYY-MM-DD.md), wiki/ for structured knowledge. Fully portable. | Skill system: each skill is a SKILL.md + supporting files. Installable from ClawdHub. MCP protocol support. | Sub-agent spawning with push-based completion. Orchestrator delegates tasks, results auto-announce. | ✅ Open source |
| **Claude Code** | 512K context window. Loads files on demand via read tool. CLAUDE.md for project-level instructions. Compacts old messages when context fills. | Session-based. No persistent memory across sessions by default. CLAUDE.md provides project continuity. User-managed files. | Built-in tools: read, write, edit, exec, web search. Extensible via MCP servers. Permission system (allow/deny/ask). | Single-agent. No native sub-agent support. Can invoke other CLI tools via exec. | ✅ Open source |
| **Codex (OpenAI CLI)** | Loads repo structure + relevant files. AGENTS.md for instructions. Sandboxed execution environment. | No persistent memory. Reads project files (README, AGENTS.md) for context. Session state resets on each run. | Built-in: file read/write, exec, web search. Runs in network-disabled sandbox by default. Can enable network per session. | Single-agent. No multi-agent orchestration. Designed for single-task execution. | ✅ Open source |
| **Cline** | VS Code extension. Loads open files + relevant workspace files. Custom instructions file. Sliding window for context management. | No built-in persistent memory. Relies on workspace files and conversation history within VS Code session. | File operations, terminal commands, browser automation. MCP server support for extensibility. Approval workflow for actions. | Single-agent. No multi-agent support. Human-in-the-loop via approval prompts in VS Code. | ✅ Open source |
| **Aider** | Git-aware context. Explicitly add files to context with /add. Repo map provides project-wide overview. Diff-based editing. | Git history as implicit memory. No dedicated memory system. Session history persists within terminal session. | Focused tool set: file editing (diff format), git operations, linting, testing. No plugin system. | Single-agent. No multi-agent. Designed for paired programming (human + one agent). | ✅ Open source |
| **Cursor** | IDE-integrated. Full repo indexing with embeddings. Loads relevant files based on semantic search. @-mentions for explicit context. | No persistent agent memory. Codebase index serves as implicit knowledge. .cursorrules for project config. | Code editing, terminal, file operations, documentation lookup. Integrated debugger context. No plugin marketplace. | Single-agent. No multi-agent. Background indexing is async but not agent-based. | ❌ Proprietary |
| **Nexu** | Agent-native IM platform. Per-agent workspace with AGENTS.md, SOUL.md, USER.md, MEMORY.md. Skills inject specialized context. | Comprehensive: MEMORY.md (curated long-term), daily logs, wiki/ knowledge base, TOOLS.md (environment-specific notes). Cross-session continuity by design. | Skill marketplace. Each skill is self-contained with SKILL.md instructions. Platform-level tools: calendar, email, messaging, browser, camera, nodes. | Multi-agent native. Sub-agent spawning, cross-channel messaging, cron scheduling. Agents can coordinate across IM channels. | ❌ Proprietary (platform) |

## Deep Dive: Key Differentiators

### Context Strategy

How each harness decides what to show the model:

```
Aider          : Explicit — user adds files manually (/add, /drop)
Claude Code    : On-demand — agent reads files as needed
Cursor         : Semantic — embeddings index, auto-retrieves relevant code
OpenClaw/Nexu  : Config-driven — AGENTS.md declares what to load
Codex          : Repo-aware — scans structure, loads relevant files
Cline          : IDE-aware — open tabs + workspace files
```

**Trade-off:** Explicit control (Aider) gives precision but requires user effort. Semantic retrieval (Cursor) is automatic but can miss or include wrong files. Config-driven (OpenClaw) is predictable but needs upfront setup.

### Memory Architecture

```python
# Type 1: No memory (Claude Code, Codex, Cursor, Cline)
# Each session starts fresh. Context comes from project files.
context = load_project_files()  # That's it

# Type 2: File-based memory (OpenClaw, Nexu)
# Persistent knowledge across sessions, user-editable.
context = (
    load_project_files()
    + load_memory("MEMORY.md")
    + load_daily_log(today)
    + load_wiki_if_relevant(task)
)

# Type 3: Embedded memory (proprietary platforms)
# Stored in vector DB, retrieved by similarity.
context = (
    load_project_files()
    + vector_search(task, memory_store)
)
```

### Tool Extensibility

| Approach | Projects | Pros | Cons |
|---|---|---|---|
| **MCP Protocol** | OpenClaw, Claude Code, Cline | Standard protocol, interoperable | Server setup overhead |
| **Skill Files** | OpenClaw, Nexu | Self-contained, shareable, marketplace | Custom format |
| **Built-in Only** | Aider, Codex | Simple, predictable | Limited extensibility |
| **IDE Integration** | Cursor, Cline | Rich editor context | Tied to IDE |

### Multi-Agent Patterns

Most harnesses are single-agent. Multi-agent support varies significantly:

```python
# OpenClaw/Nexu: First-class sub-agent spawning
subagent = spawn(
    task="Research competitor pricing",
    model="gpt-4o",
    tools=["web_search", "web_fetch"],
)
# Result auto-announces when done — no polling needed

# Claude Code: Indirect multi-agent via exec
result = exec("claude-code --print 'Review this PR'")
# Works but no structured communication

# Others: No native multi-agent
# Workaround: multiple terminal sessions, manual coordination
```

## Choosing the Right Harness

| If you need... | Consider |
|---|---|
| Deep code editing with IDE integration | **Cursor** or **Cline** |
| Terminal-based coding agent | **Claude Code** or **Aider** |
| Sandboxed task execution | **Codex** |
| Multi-agent orchestration | **OpenClaw** or **Nexu** |
| Persistent memory across sessions | **OpenClaw** or **Nexu** |
| Extensible tool ecosystem | **OpenClaw** (skills + MCP) |
| Minimal setup, just works | **Aider** |

## What the Table Doesn't Show

- **Model support** — Most harnesses are model-agnostic (OpenClaw, Cline, Aider support many providers). Codex is OpenAI-only. Claude Code is Anthropic-focused.
- **Cost** — Varies wildly based on model choice, context size, and task complexity. Not a harness feature, but a usage pattern.
- **Speed** — Depends more on model latency than harness architecture. Streaming support is universal.
- **Community** — Open-source projects (Aider, Claude Code, Cline, OpenClaw) have active communities. Community size doesn't equal quality.

## Common Pitfalls

- **Choosing based on hype** — Pick the harness that fits your workflow, not the one with the most GitHub stars.
- **Ignoring memory** — If your tasks span sessions, a harness without persistent memory means re-explaining context every time.
- **Assuming "open source" means "free"** — The harness is free; the model API calls are not. Budget for API costs.
- **Locking into one harness** — File-based configurations (AGENTS.md, MEMORY.md) are portable. Proprietary memory is not. See [Memory Portability →](memory-portability.md).

## Further Reading

- [Scaling Dimensions →](scaling-dimensions.md) — How these harnesses scale across time, space, and interaction
- [Glossary →](glossary.md) — Key terms used throughout this guide
