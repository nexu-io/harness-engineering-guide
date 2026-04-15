---
author: Nexu
---

# Skill System

> **Core Insight:** A skill is not a tool — it's a *bundle* of related tools, documentation, and behavior rules packaged as a single capability. The skill system turns "100 tools crammed into every prompt" into "a menu of capabilities loaded on demand," saving thousands of tokens and dramatically improving tool selection accuracy.

## What is a Skill?

A tool is a single function the model can call. A **skill** is a packaged capability that bundles:

- **Tools** — one or more related function schemas and handlers
- **Documentation** — a SKILL.md file explaining when and how to use the skill
- **Behavior rules** — constraints, patterns, and conventions for the model to follow

```
skill/
├── SKILL.md          # Documentation: when to use, how to use, constraints
├── tools.py          # Tool implementations
└── schema.json       # Tool schemas (or generated from code)
```

For example, a `git` skill doesn't expose a single `git` tool — it bundles `git_status`, `git_diff`, `git_commit`, `git_push`, `git_log`, and includes documentation on commit message conventions, branch naming, and when to ask before pushing.

## Skill vs. Tool

| | Tool | Skill |
|---|------|-------|
| **Scope** | Single function | Bundle of related functions |
| **Documentation** | Parameter description | Full SKILL.md with examples, conventions |
| **Loading** | Always present or absent | Loaded on demand from a menu |
| **Context cost** | ~100–200 tokens per schema | ~200 token menu entry + ~1,000 tokens when loaded |
| **Behavior rules** | None | Can include constraints, workflows, patterns |

The distinction matters for token economics. A harness with 80 tools pays ~12,000 tokens per API call just for schemas. A skill system with 15 skills and a 300-token menu loads only what's needed.

## SKILL.md Format

The SKILL.md file is the skill's instruction manual. The model reads it when the skill is loaded:

```markdown
# Git Operations

## When to Use
- User asks to check, commit, or push code changes
- You need to inspect file history or diffs
- Resolving merge conflicts

## Available Tools
- `git_status` — Show working tree status
- `git_diff` — Show changes (staged or unstaged)
- `git_commit` — Commit staged changes with a message
- `git_push` — Push commits to remote
- `git_log` — Show recent commit history

## Conventions
- Always run `git_status` before committing
- Use conventional commit messages (feat:, fix:, docs:)
- Never force-push without explicit user approval
- Commit message should be under 72 characters

## Examples
To commit and push:
1. `git_status` → review what's changed
2. `git_diff` → verify the changes are correct
3. `git_commit("feat: add user auth middleware")`
4. `git_push`
```

This format gives the model enough context to use the skill correctly without embedding all that knowledge in tool descriptions.

## The Skill Menu Pattern

Instead of loading all tools at startup, present the model with a compact menu of available skills. The model reads the menu, decides which skill it needs, and loads it:

```python
SKILL_MENU = """Available skills (use load_skill to activate):

- file_ops: Read, write, search, and edit files in the workspace
- git: Version control — status, diff, commit, push, log
- web: HTTP requests, web search, URL fetching
- shell: Execute shell commands in a sandbox
- database: SQL queries, schema inspection, migrations
- calendar: Create events, check availability, manage schedules
- email: Read inbox, send emails, search messages
- image: Generate and analyze images
"""
```

The menu costs ~150 tokens. Loading a skill adds its SKILL.md (~500–1,000 tokens) and tool schemas (~200–800 tokens). Compared to loading all tools upfront:

```
Strategy                    Tokens (8 skills, ~60 tools)
────────────────────────────────────────────────────────
All tools upfront:          ~12,000 tokens (always)
Skill menu + 2 loaded:      ~150 + ~2,400 = ~2,550 tokens
────────────────────────────────────────────────────────
Savings:                    ~9,450 tokens per turn (78%)
```

Over a 30-turn session, that's ~280K tokens saved — real money at API pricing.

## Skill Registry Implementation

```python
import json
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class Skill:
    name: str
    description: str
    doc: str                           # Contents of SKILL.md
    tools: list[dict] = field(default_factory=list)        # Tool schemas
    handlers: dict = field(default_factory=dict)            # name → callable

class SkillRegistry:
    """Registry with on-demand skill loading."""

    def __init__(self, skills_dir: str):
        self.skills_dir = Path(skills_dir)
        self._catalog: dict[str, Skill] = {}
        self._active: dict[str, Skill] = {}
        self._scan()

    def _scan(self):
        """Scan the skills directory and build the catalog."""
        for skill_dir in self.skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            schema_file = skill_dir / "schema.json"
            if not skill_md.exists():
                continue

            doc = skill_md.read_text()
            # Extract first line after "# " as description
            first_heading = ""
            for line in doc.splitlines():
                if line.startswith("# "):
                    first_heading = line[2:].strip()
                    break

            schemas = []
            if schema_file.exists():
                schemas = json.loads(schema_file.read_text())

            self._catalog[skill_dir.name] = Skill(
                name=skill_dir.name,
                description=first_heading,
                doc=doc,
                tools=schemas,
            )

    def get_menu(self) -> str:
        """Generate the skill menu for the model."""
        lines = ["Available skills (use load_skill to activate):\n"]
        for name, skill in self._catalog.items():
            status = " [loaded]" if name in self._active else ""
            lines.append(f"- {name}: {skill.description}{status}")
        return "\n".join(lines)

    def load_skill(self, name: str) -> str:
        """Load a skill, making its tools available."""
        if name not in self._catalog:
            return f"Error: Unknown skill '{name}'. Check the skill menu."
        if name in self._active:
            return f"Skill '{name}' is already loaded."

        skill = self._catalog[name]
        self._active[name] = skill
        tool_names = [t["name"] for t in skill.tools]
        return (
            f"Loaded skill '{name}' with {len(skill.tools)} tools: "
            f"{', '.join(tool_names)}\n\n"
            f"Documentation:\n{skill.doc}"
        )

    def unload_skill(self, name: str) -> str:
        """Unload a skill to free up context space."""
        if name not in self._active:
            return f"Skill '{name}' is not loaded."
        del self._active[name]
        return f"Unloaded skill '{name}'."

    def get_active_schemas(self) -> list[dict]:
        """Return tool schemas for all currently loaded skills."""
        schemas = []
        for skill in self._active.values():
            schemas.extend(skill.tools)
        # Always include the meta-tools
        schemas.append({
            "name": "load_skill",
            "description": "Load a skill by name to activate its tools",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Skill name from the menu"}
                },
                "required": ["name"],
            },
        })
        return schemas

    def dispatch(self, tool_name: str, arguments: dict) -> str:
        """Dispatch a tool call to the appropriate skill handler."""
        if tool_name == "load_skill":
            return self.load_skill(arguments["name"])

        for skill in self._active.values():
            if tool_name in skill.handlers:
                try:
                    return str(skill.handlers[tool_name](**arguments))
                except Exception as e:
                    return f"Error: {type(e).__name__}: {e}"

        return f"Error: Tool '{tool_name}' not found. Is the skill loaded?"
```

## Thin Harness + Thick Skills

The architecture principle: the harness should be thin — just the agentic loop, context assembly, and skill registry. All domain-specific intelligence lives in skills:

```
┌─────────────────────────────────────────────────┐
│  Harness (thin)                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Agentic  │  │  Context   │  │    Skill     │ │
│  │  Loop    │  │ Assembler  │  │  Registry    │ │
│  └──────────┘  └───────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ loads on demand
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│  git    │    │  file_ops  │    │  web      │
│  skill  │    │  skill     │    │  skill    │
└─────────┘    └───────────┘    └───────────┘
```

This separation has practical benefits:
- **Skills are portable** — a skill written for one harness works in another
- **Skills are testable** — test tools and schemas in isolation
- **Skills are composable** — the model discovers how to combine loaded skills naturally
- **The harness stays simple** — add capabilities by adding skills, not by modifying the core

## Common Pitfalls

- **Loading all skills at startup** — Defeats the purpose of the skill system. Use the menu pattern and load on demand.
- **Monolithic skills** — A "do-everything" skill with 30 tools is just the all-tools-upfront problem in disguise. Keep skills focused: 3–8 tools each.
- **Missing SKILL.md** — Tools without documentation force the model to guess at conventions. The SKILL.md is not optional; it's the skill's brain.
- **No unload mechanism** — If the model loads five skills and can't unload them, context fills up fast. Always provide `unload_skill` alongside `load_skill`.
- **Confusing skill and tool names** — If a skill is named `git` and contains a tool named `git`, the model may try to call the skill name as a tool. Use distinct naming: skill `git`, tools `git_status`, `git_diff`, etc.

## Further Reading

- [OpenClaw Skills Architecture](https://docs.openclaw.ai) — A production skill system with skill menus and on-demand loading
- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Best practices for tool design that apply to skills
- [Model Context Protocol: Tools](https://modelcontextprotocol.io/) — The open standard for tool/skill interop across harnesses
