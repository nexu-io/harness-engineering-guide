# The MEMORY.md Pattern

MEMORY.md is a plain-text file that gives an AI agent persistent memory across sessions. The agent reads it at startup, updates it during work, and curates it over time — like a human's long-term memory stored as a Markdown file.

## Why It Matters

LLMs are stateless. Every API call starts from zero — no recollection of yesterday's conversation, no knowledge of user preferences, no memory of past mistakes. MEMORY.md solves this with the simplest possible mechanism: a file. No vector database, no embeddings, no infrastructure. Just a Markdown file the agent reads and writes.

## File Structure

A production memory system has two layers:

```
project/
├── MEMORY.md                    # Curated long-term memory
└── memory/
    ├── 2025-07-10.md            # Today's raw log
    ├── 2025-07-09.md            # Yesterday
    ├── 2025-07-08.md            # Day before
    └── heartbeat-state.json     # Metadata for periodic checks
```

**MEMORY.md** — Curated, high-signal. Like your brain's long-term memory. Periodically updated by the agent reviewing daily logs and extracting what's worth keeping.

**memory/YYYY-MM-DD.md** — Raw daily logs. Everything that happened, decisions made, problems solved. Like a journal.

## A Real MEMORY.md

```markdown
# MEMORY.md

## User
- Name: Sarah Chen
- Timezone: America/Los_Angeles
- Prefers concise responses, dislikes verbose explanations
- Python expert, doesn't need basic syntax explained

## Project Context
- Main project: api-gateway (FastAPI + PostgreSQL)
- Test command: `pytest tests/ -x --tb=short`
- Deploy: `git push origin main` triggers CI/CD
- Staging URL: https://staging.api.example.com

## Lessons Learned
- 2025-07-08: Sarah's Postgres connection pool needs `max_overflow=20` 
  in production. Default of 10 caused timeout errors under load.
- 2025-07-05: Never run migrations during business hours (9am-5pm PT).
  Sarah got paged last time.
- 2025-07-01: The `/v2/users` endpoint has a known bug with pagination.
  Don't try to fix it — it's being replaced next sprint.

## Preferences
- Git: squash commits on feature branches, merge commits on main
- Code style: black + isort, line length 100
- PR descriptions: include "## What" and "## Why" sections
```

## A Real Daily Log

```markdown
# 2025-07-10

## 14:30 — Bug fix: rate limiter
- Sarah asked to fix the rate limiter returning 500 instead of 429
- Root cause: Redis connection timeout not handled in middleware
- Fix: Added try/except in `middleware/rate_limit.py`, returns 429 on Redis failure
- PR #247 opened, tests passing

## 16:15 — Database migration
- Added `last_login_at` column to users table
- Migration: `alembic revision --autogenerate -m "add last_login_at"`
- Tested locally, pushed to staging
- Note: Sarah wants this deployed tomorrow morning, NOT during business hours

## 17:00 — Memory update
- Added Redis timeout handling lesson to MEMORY.md
- Sarah confirmed she prefers morning deployments (before 9am PT)
```

## How the Harness Uses Memory

### Loading at Session Start

```python
import os
from datetime import datetime, timedelta

def load_memory(workspace: str) -> str:
    """Load MEMORY.md + recent daily logs into context."""
    context_parts = []

    # 1. Load curated long-term memory
    memory_path = os.path.join(workspace, "MEMORY.md")
    if os.path.exists(memory_path):
        with open(memory_path) as f:
            context_parts.append(f"# Long-Term Memory\n{f.read()}")

    # 2. Load today's and yesterday's daily logs
    memory_dir = os.path.join(workspace, "memory")
    for days_ago in [0, 1]:
        date = datetime.now() - timedelta(days=days_ago)
        daily_path = os.path.join(memory_dir, f"{date.strftime('%Y-%m-%d')}.md")
        if os.path.exists(daily_path):
            with open(daily_path) as f:
                context_parts.append(f"# Log: {date.strftime('%Y-%m-%d')}\n{f.read()}")

    return "\n\n---\n\n".join(context_parts)

# Inject into system prompt
memory = load_memory("/path/to/workspace")
system_prompt = f"""You are a helpful assistant.

## Your Memory
{memory}

Use this memory to provide context-aware responses. Update memory files
when you learn new information about the user or project."""
```

### Writing Daily Logs

Give the agent a tool to append to today's log:

```python
from datetime import datetime

def append_to_daily_log(workspace: str, entry: str) -> str:
    """Append an entry to today's daily log."""
    today = datetime.now().strftime("%Y-%m-%d")
    log_dir = os.path.join(workspace, "memory")
    os.makedirs(log_dir, exist_ok=True)

    log_path = os.path.join(log_dir, f"{today}.md")
    timestamp = datetime.now().strftime("%H:%M")

    # Create or append
    mode = "a" if os.path.exists(log_path) else "w"
    with open(log_path, mode) as f:
        if mode == "w":
            f.write(f"# {today}\n\n")
        f.write(f"## {timestamp}\n{entry}\n\n")

    return f"Logged to {log_path}"
```

### Curating Long-Term Memory

Periodically (daily or via heartbeat), the agent reviews recent logs and updates MEMORY.md:

```python
def curate_memory(client, workspace: str):
    """Have the agent review recent logs and update MEMORY.md."""
    # Load recent daily logs (last 7 days)
    recent_logs = load_recent_logs(workspace, days=7)

    # Load current MEMORY.md
    with open(os.path.join(workspace, "MEMORY.md")) as f:
        current_memory = f.read()

    prompt = f"""Review these recent daily logs and update MEMORY.md.

Current MEMORY.md:
{current_memory}

Recent logs:
{recent_logs}

Rules:
- Add new lessons learned, user preferences, project facts
- Remove outdated information
- Keep it concise — this goes into the context window every session
- Target: under 500 words (roughly 700 tokens)
Output the updated MEMORY.md content only."""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    with open(os.path.join(workspace, "MEMORY.md"), "w") as f:
        f.write(response.choices[0].message.content)
```

## Token Budget

Memory competes with everything else for context window space:

```
128K context window (GPT-4o)
├── System prompt:     ~500 tokens
├── MEMORY.md:         ~700 tokens (target)
├── Daily logs (2d):   ~1,000 tokens
├── Active files:      ~10,000 tokens
├── Conversation:      ~50,000 tokens
└── Remaining:         ~65,800 tokens (for model output + headroom)
```

The key constraint: MEMORY.md should be **concise enough to load every session** without significantly impacting the token budget. 500 words (~700 tokens) is a good target. If it grows past 1,000 words, it's time to prune.

## Memory Hygiene

### What Belongs in MEMORY.md

- User preferences and working style
- Project-specific facts (commands, URLs, conventions)
- Lessons learned from past mistakes
- Key decisions and their rationale

### What Doesn't Belong

- Temporary task state (use daily logs)
- Large code snippets (link to files instead)
- Secrets, API keys, passwords (never)
- Verbatim conversation transcripts (summarize instead)

## Common Pitfalls

- **Letting MEMORY.md grow unchecked** — Without curation, it becomes a dump of everything that ever happened. Set a word limit and enforce it during the curation step.
- **Loading too many daily logs** — Each daily log might be 500-1,000 tokens. Loading a week's worth eats 5K+ tokens every session. Load today + yesterday; the rest should be curated into MEMORY.md.
- **Storing secrets in memory files** — Memory files are plain text, often committed to Git. Never store API keys, passwords, or tokens in them.

## Further Reading

- [OpenClaw AGENTS.md Memory Pattern](https://github.com/anthropics/anthropic-cookbook) — Companion files for agent persistence
- [Letta (MemGPT)](https://github.com/letta-ai/letta) — More sophisticated memory management with tiered storage
- [Memory Portability →](memory-portability.md) — Moving memory between harness implementations
