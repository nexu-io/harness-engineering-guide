# Memory Portability

Your agent's memory is more valuable than its model. Models are interchangeable — switch from GPT-4o to Claude Sonnet and the agent still works. But if you lose the agent's memory, you lose everything it learned about your codebase, your preferences, your workflows.

The problem: most platforms store agent memory in proprietary formats, locked inside their systems. This guide covers why that's a problem and how file-based memory solves it.

## The Vendor Lock-In Problem

Here's what happens when agent memory lives inside a platform:

```
┌─────────────────────────────────┐
│       Platform A (Claude)        │
│  ┌───────────────────────────┐  │
│  │  Memory: 847 facts        │  │
│  │  Format: proprietary JSON  │  │
│  │  Access: API only          │  │
│  │  Export: ❌ not available   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘

Want to switch to Platform B?
→ Start from zero. All memory lost.
```

Claude's memory stores "facts" as internal embeddings. ChatGPT's memory stores key-value pairs in an opaque format. GitHub Copilot's context is in a proprietary index. None of these are portable.

This creates real lock-in:
- **Can't switch models** — Even if a better model appears, your memory is trapped.
- **Can't back up** — If the service goes down, your agent's knowledge goes with it.
- **Can't inspect** — You can't see exactly what the agent "remembers" or correct mistakes.
- **Can't compose** — Two different agents can't share memory across platforms.

## The File-Based Solution

The fix is surprisingly simple: **store memory as plain text files in your filesystem**.

```
workspace/
├── AGENTS.md          ← Agent instructions (portable config)
├── MEMORY.md          ← Long-term memory (curated knowledge)
├── memory/
│   ├── 2025-01-15.md  ← Daily session log
│   ├── 2025-01-16.md  ← Daily session log
│   └── ...
└── wiki/
    ├── index.md       ← Knowledge base index
    ├── entities/       ← People, projects, companies
    └── concepts/       ← Ideas, patterns, definitions
```

This approach gives you:

| Property | Platform Memory | File-Based Memory |
|----------|----------------|-------------------|
| **Portability** | ❌ Locked to vendor | ✅ Copy files anywhere |
| **Inspectability** | ❌ Opaque | ✅ Read in any editor |
| **Backup** | ❌ Platform-dependent | ✅ Git, rsync, anything |
| **Editability** | ❌ Limited API | ✅ Edit directly |
| **Multi-agent** | ❌ Per-agent silos | ✅ Shared filesystem |
| **Version control** | ❌ No history | ✅ Full git history |

## Memory File Format

MEMORY.md is the core long-term memory file. It's structured Markdown that any model can read:

```markdown
# MEMORY.md

## About My Human
- Name: Alice Chen
- Timezone: America/Los_Angeles
- Prefers concise answers, bullet points over paragraphs
- Python developer, uses pytest, prefers pathlib over os.path

## Projects
### Project Alpha
- FastAPI backend, React frontend
- Database: PostgreSQL with SQLAlchemy
- Deploy: AWS ECS, CI via GitHub Actions
- Last worked on: auth refactor (Jan 2025)

## Preferences
- Code style: Black formatter, 88-char lines
- Git: conventional commits, squash merge
- Communication: direct, no filler words

## Lessons Learned
- Alice's API uses API keys in headers, not query params
- The staging DB credentials are in 1Password vault "DevOps"
- Never auto-push to main — always create PRs
```

Daily files capture raw session details:

```markdown
# 2025-01-16

## Session 1 (09:30)
- Fixed bug in auth middleware — token validation was case-sensitive
- Created PR #142, assigned to Bob for review
- Alice mentioned she'll be OOO next week

## Session 2 (14:15)
- Reviewed PR #139 from Charlie — suggested splitting into two PRs
- Updated deployment docs with new environment variable for rate limiting
```

## Migration Script: Claude Memory → MEMORY.md

If you're moving from Claude's built-in memory, here's how to export and convert:

```python
"""
Migrate Claude memory to file-based MEMORY.md format.

Claude stores memory as a list of facts. We:
1. Export facts from Claude's memory panel
2. Categorize them by topic
3. Write structured MEMORY.md
"""

import json
import re
from pathlib import Path
from collections import defaultdict

def export_claude_memory(input_file: str) -> list[str]:
    """
    Parse Claude memory export.

    Claude memory can be exported as a text list, one fact per line.
    Copy-paste from Settings > Memory in Claude's UI.
    """
    raw = Path(input_file).read_text()
    facts = [
        line.strip().lstrip("•-* ")
        for line in raw.strip().split("\n")
        if line.strip() and not line.startswith("#")
    ]
    return facts

def categorize_facts(facts: list[str]) -> dict[str, list[str]]:
    """Categorize facts by topic using keyword matching."""
    categories = defaultdict(list)

    patterns = {
        "About My Human": [
            r"(?:name|call me|I am|I'm|my name)",
            r"(?:timezone|location|city|country)",
            r"(?:prefer|like|want|don't like|hate)",
        ],
        "Projects": [
            r"(?:project|repo|codebase|app|service)",
            r"(?:deploy|database|frontend|backend|API)",
        ],
        "Technical Preferences": [
            r"(?:use|prefer|style|format|convention)",
            r"(?:language|framework|library|tool)",
        ],
        "People & Teams": [
            r"(?:team|colleague|manager|report|work with)",
        ],
        "Lessons Learned": [
            r"(?:remember|note|important|don't forget|always|never)",
        ],
    }

    for fact in facts:
        matched = False
        for category, pats in patterns.items():
            for pat in pats:
                if re.search(pat, fact, re.IGNORECASE):
                    categories[category].append(fact)
                    matched = True
                    break
            if matched:
                break
        if not matched:
            categories["Other"].append(fact)

    return dict(categories)

def generate_memory_md(categories: dict[str, list[str]]) -> str:
    """Generate MEMORY.md from categorized facts."""
    lines = ["# MEMORY.md", "",
             "_Migrated from Claude memory_", ""]

    for category, facts in categories.items():
        lines.append(f"## {category}")
        for fact in facts:
            lines.append(f"- {fact}")
        lines.append("")

    return "\n".join(lines)

def migrate(input_file: str, output_file: str = "MEMORY.md"):
    """Full migration pipeline."""
    print(f"Reading Claude memory from {input_file}...")
    facts = export_claude_memory(input_file)
    print(f"Found {len(facts)} facts")

    print("Categorizing...")
    categories = categorize_facts(facts)
    for cat, items in categories.items():
        print(f"  {cat}: {len(items)} facts")

    print(f"Writing {output_file}...")
    content = generate_memory_md(categories)
    Path(output_file).write_text(content)
    print(f"✅ Migration complete: {output_file}")

# Usage
if __name__ == "__main__":
    migrate("claude-memory-export.txt", "MEMORY.md")
```

## ChatGPT Memory Migration

ChatGPT's memory export is a JSON format. Here's the converter:

```python
def export_chatgpt_memory(input_file: str) -> list[str]:
    """
    Parse ChatGPT memory export (JSON).
    Download from Settings > Personalization > Memory > Manage > Export.
    """
    data = json.loads(Path(input_file).read_text())

    facts = []
    for entry in data.get("memories", data if isinstance(data, list) else []):
        if isinstance(entry, str):
            facts.append(entry)
        elif isinstance(entry, dict):
            content = entry.get("content", entry.get("memory", ""))
            if content:
                facts.append(content)

    return facts

# Same pipeline — just swap the export function:
# facts = export_chatgpt_memory("chatgpt-memories.json")
# categories = categorize_facts(facts)
# content = generate_memory_md(categories)
```

## Cross-Harness Memory Sharing

With file-based memory, multiple harnesses can share the same knowledge:

```python
class SharedMemory:
    """File-based memory accessible by multiple agents."""

    def __init__(self, memory_dir: str):
        self.dir = Path(memory_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def read(self, filename: str = "MEMORY.md") -> str:
        path = self.dir / filename
        return path.read_text() if path.exists() else ""

    def append(self, filename: str, content: str):
        path = self.dir / filename
        existing = path.read_text() if path.exists() else ""
        path.write_text(existing + "\n" + content)

    def read_daily(self, date: str = None) -> str:
        if date is None:
            from datetime import date as d
            date = d.today().isoformat()
        path = self.dir / "memory" / f"{date}.md"
        return path.read_text() if path.exists() else ""

# Two different harnesses, same memory
memory = SharedMemory("/home/user/.agent-memory")

# Harness A (Claude Code) writes a lesson
memory.append("MEMORY.md", "- Project uses pnpm, not npm")

# Harness B (OpenClaw) reads it
context = memory.read("MEMORY.md")
# → Includes the lesson from Harness A
```

## Git as Memory Version Control

Since memory is just files, you get version control for free:

```bash
cd ~/.agent-memory
git init
git add -A
git commit -m "Initial memory state"

# After each session, the harness commits changes
git add -A
git commit -m "Session 2025-01-16 14:30 — worked on auth refactor"

# Review what the agent learned this week
git log --oneline --since="1 week ago"

# Roll back a bad memory update
git revert HEAD

# Diff what changed in a session
git diff HEAD~1 MEMORY.md
```

This is impossible with proprietary memory systems. With files, it's just git.

## Common Pitfalls

- **Memory files growing unbounded** — Periodically curate MEMORY.md. Remove stale facts, consolidate related items. Set a target size (e.g., < 5KB).
- **Daily files accumulating forever** — Archive or compress daily files older than 30 days. The agent rarely needs them.
- **Assuming the model reads everything** — Memory files must fit in the context window. If MEMORY.md is 50KB, the model won't see most of it. Keep it focused.
- **No structure** — Dumping everything into one file makes it hard for the model to find relevant facts. Use sections and categories.

## Further Reading

- [What is a Harness? →](what-is-harness.md) — How memory fits into the harness architecture
- [Scaling Dimensions →](scaling-dimensions.md) — Memory as a time-axis scaling strategy
