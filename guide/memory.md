# Memory Systems

## The Memory Problem

LLMs have no persistent memory. Every API call starts from zero. The harness is responsible for giving agents the *illusion* of continuity — and ideally, real continuity.

## AGENTS.md / MEMORY.md Pattern

This file-based pattern has emerged as a de facto standard across multiple harness implementations:

### File Structure

```
workspace/
├── AGENTS.md          # Agent identity, rules, configuration
├── MEMORY.md          # Curated long-term memories
├── memory/
│   ├── 2026-04-13.md  # Today's raw session log
│   ├── 2026-04-12.md  # Yesterday's log
│   └── ...
├── TOOLS.md           # Tool-specific notes (API keys, device names)
└── SOUL.md            # Agent personality & values (optional)
```

### How It Works

1. **Every session start:** Agent reads AGENTS.md + MEMORY.md + recent daily logs
2. **During session:** Agent appends to today's `memory/YYYY-MM-DD.md`
3. **Periodically:** Agent reviews daily logs and distills insights into MEMORY.md
4. **Result:** MEMORY.md becomes curated wisdom; daily logs are raw data

### Why Plain Text?

- **Human-readable** — Users can inspect and edit their agent's memory
- **Version-controlled** — Memory changes are tracked in git
- **Portable** — Move between harnesses by copying files
- **No vendor lock-in** — No proprietary database format

## Session vs Long-term Memory

| | Session Memory | Long-term Memory |
|--|---------------|-----------------|
| **Lifespan** | Single conversation | Across all sessions |
| **Storage** | Context window + temp files | MEMORY.md + vector DB |
| **Managed by** | Context manager | Memory consolidation agent |
| **Capacity** | Limited by context window | Unlimited (with retrieval) |

## Memory Ownership & Portability

The most consequential question in agent memory design:

### User-Owned (Open)
- Memory stored as local files (MEMORY.md, daily logs)
- User can read, edit, delete, and export
- Portable between platforms
- **Example:** OpenClaw, Nexu

### Platform-Owned (Closed)
- Memory stored on vendor servers
- Opaque format, no export
- Lost if you leave the platform
- **Example:** Claude's "memory" feature, Codex encrypted summaries

### Hybrid
- Platform hosts memory, but user can export
- API access to memory contents
- **Example:** Some enterprise agent platforms

## Context Compression: Three Lines of Defense

As conversations grow, context windows overflow. The learn-claude-code project (documented by LongjingAgent) demonstrates a three-layer compression strategy used in production harnesses:

### Layer 1: Auto-Decay
Tool outputs older than N turns (typically 3) are automatically replaced with compact markers:
```
[Previous: used read_file on src/main.ts]
```
Recent turns stay complete; older ones keep only a fingerprint. This is passive and always-on.

### Layer 2: Threshold Compression
When total tokens exceed a configurable limit:
1. Full conversation is saved to disk (nothing is lost)
2. Model generates a structured summary of all history
3. Summary replaces all historical messages in the active context

The agent continues with a clean context but retains awareness of everything that happened.

### Layer 3: Manual Compression
The agent itself can proactively trigger compression via a `compact` tool when it detects the context is getting cluttered. This gives the agent meta-awareness of its own context health.

**Key principle**: Information is never truly lost — it's moved from active context to persistent storage. The harness manages the boundary between "what's in memory" and "what's on disk."

## Skill Loading: Menu-First Architecture

Rather than stuffing all domain knowledge into the system prompt (which wastes tokens on irrelevant skills), modern harnesses use a two-phase loading pattern:

1. **Boot phase**: Scan all SKILL.md files, inject only name + one-line description (~50 tokens total)
2. **Runtime phase**: When the agent determines it needs a specific skill, it calls `load_skill` to inject the full content (~2000-5000 tokens)

This is the "show the menu at boot, serve the full recipe only when ordered" pattern — and it's how Claude Code, OpenClaw, and most production harnesses handle extensibility.

---

*Next: [Security & Sandboxing →](security.md)*
