---
author: Nexu
---

# Memory & Context

> **Core Insight:** The model only knows what's in its context window. Memory is how you bridge the gap between what the model *needs to know* and what it *can see* in a single API call. Getting this right is the highest-leverage problem in harness engineering.

## Three Distinct Concepts

These terms are often conflated but serve different purposes:

| Concept | Scope | Persistence | Example |
|---------|-------|-------------|---------|
| **Context** | Single API call | None — rebuilt every turn | System prompt + tools + recent messages + relevant files |
| **Session** | Single conversation or task | In-memory, lost on restart | Message history, tool call results, working state |
| **Memory** | Cross-session, indefinite | Written to disk | MEMORY.md, daily logs, learned preferences |

**Context** is the model's "working memory" — everything assembled into a single prompt. **Session** is the state of an ongoing interaction. **Memory** is what survives after the session ends.

## Context Assembly

Every turn of the agentic loop starts with assembling the context. This is a prioritized packing problem — you have a fixed token budget and must decide what goes in:

```
Context Window (e.g., 128K tokens)
┌─────────────────────────────────┐
│  System Prompt        (~500)    │  ← Always included, highest priority
│  Tool Schemas         (~2000)   │  ← Active tools only
│  Memory Summary       (~1000)   │  ← Compressed long-term memory
│  Relevant Files       (~5000)   │  ← Task-specific context
│  Conversation History (~varies) │  ← Grows over time, needs pruning
│  [Remaining Budget]             │  ← Available for new content
└─────────────────────────────────┘
```

A priority system determines what gets included when space is tight:

```python
class ContextAssembler:
    def __init__(self, max_tokens: int = 128_000):
        self.max_tokens = max_tokens
        self.sections = []  # (priority, name, content)

    def add(self, priority: int, name: str, content: str):
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        # Sort by priority (lower = higher priority)
        self.sections.sort(key=lambda x: x[0])
        messages = []
        used_tokens = 0
        for priority, name, content in self.sections:
            token_count = estimate_tokens(content)
            if used_tokens + token_count > self.max_tokens:
                break  # Budget exceeded — skip lower-priority content
            messages.append({"role": "system", "content": f"[{name}]\n{content}"})
            used_tokens += token_count
        return messages
```

## Session Management

A session is the boundary of a single agent run. It holds:

- **Message history** — the full conversation including tool calls and results
- **Working state** — which files are open, which skills are loaded, current task progress
- **Scratch space** — temporary data the agent generated but hasn't committed

The critical session design choice is **when to clear it**. Some options:

| Strategy | Behavior | Use case |
|----------|----------|----------|
| **Per-task** | New session per user request | Stateless assistant |
| **Per-conversation** | Session persists across turns in one chat | Interactive coding |
| **Persistent** | Session survives process restart | Long-running background agent |

Persistent sessions require serialization — writing session state to disk so it can be restored. This is where session and memory overlap: anything worth keeping across restarts should be written to a memory file rather than kept in session state.

## Memory Architecture

The proven memory architecture uses two tiers:

### Tier 1: Daily Logs

Raw, chronological records of what happened. Written during the session, not curated:

```markdown
<!-- memory/2026-04-15.md -->
# 2026-04-15

## 14:30 — Refactored auth module
- Moved JWT validation from middleware to dedicated service
- Tests passing (23/23)
- User prefers explicit error messages over error codes

## 16:00 — Deploy to staging
- Used blue-green deployment
- Rollback plan: revert commit abc123
```

### Tier 2: Long-term Memory

Curated, distilled knowledge. Updated periodically (not every session):

```markdown
<!-- MEMORY.md -->
# Long-term Memory

## User Preferences
- Prefers explicit error messages over error codes
- Uses pytest, not unittest
- Deploy strategy: blue-green with rollback plan

## Project Knowledge
- Auth module: JWT validation in /src/services/auth.py
- Database: PostgreSQL 15, migrations in /db/migrations/
- CI: GitHub Actions, ~3min build time

## Lessons Learned
- Always run tests before committing (broke build on 4/10)
- User dislikes verbose output — keep summaries under 5 lines
```

The key insight: daily logs are cheap to write (just append). Long-term memory requires judgment (what's worth keeping?). Production harnesses write daily logs automatically and curate MEMORY.md periodically — either on a schedule or when the agent detects significant learnings.

## Memory Read/Write Cycle

```python
def session_startup(memory_dir: str) -> str:
    """Read memory at session start."""
    sections = []
    # Always read long-term memory
    memory_path = os.path.join(memory_dir, "MEMORY.md")
    if os.path.exists(memory_path):
        sections.append(open(memory_path).read())
    # Read recent daily logs (today + yesterday)
    for days_ago in [0, 1]:
        date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        daily_path = os.path.join(memory_dir, f"memory/{date}.md")
        if os.path.exists(daily_path):
            sections.append(open(daily_path).read())
    return "\n---\n".join(sections)
```

## The AGENTS.md Pattern

A related but distinct file is AGENTS.md — a plain-text file that defines how an agent should *behave* (not what it *remembers*). Place it in any directory and a compatible harness reads it automatically:

```markdown
<!-- AGENTS.md -->
# Behavior

- You are a Python backend engineer
- Use pytest for all tests
- Follow Google style docstrings
- Never modify files in /config/ without asking

# Tools

- Prefer `ruff` over `pylint` for linting
- Use `uv` for package management
```

AGENTS.md is **declarative** (what to do) while MEMORY.md is **experiential** (what happened). Both are injected into context at session startup but serve different purposes.

## Common Pitfalls

- **Treating context as unlimited** — Even 128K tokens fill up fast with tool schemas, file contents, and conversation history. Plan your token budget explicitly.
- **Never pruning session history** — A 50-turn conversation accumulates redundant content. Compress or summarize older turns to reclaim space.
- **Writing memory too eagerly** — Not every turn produces knowledge worth persisting. Over-writing creates noise that dilutes useful information.
- **Forgetting to read memory at startup** — An agent without memory read is effectively amnesiac. This is the most common configuration bug.

## Further Reading

- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — Operating-system-inspired memory management for agents
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Memory patterns in production
