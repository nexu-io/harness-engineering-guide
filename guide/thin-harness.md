# Thin Harness + Thick Skills

A thin harness is a minimal runtime that does only three things: manage the tool loop, assemble context, and dispatch tool calls. All domain logic, specialized behavior, and complex workflows live in skill files that the harness loads on demand. The harness is the skeleton; skills are the muscles.

## Why It Matters

A monolithic harness embeds everything — tools, prompts, memory logic, error handling — into one codebase. This makes it fragile: changing how email works might break how GitHub works. A thin harness decouples the runtime from the behavior, so skills can be added, updated, or removed without touching the core loop. This is how OpenClaw, Claude Code, and most production agent systems are built.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        THIN HARNESS                         │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Context  │  │   Tool   │  │  Memory  │  │  Security  │  │
│  │ Assembler │  │   Loop   │  │  Loader  │  │  Sandbox   │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│                       │                                     │
│            ┌──────────┴──────────┐                          │
│            │    Tool Dispatcher   │                          │
│            └──────────┬──────────┘                          │
└───────────────────────┼─────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐
    │ GitHub  │   │  Calendar  │  │  Email  │
    │  Skill  │   │   Skill    │  │  Skill  │
    │         │   │            │  │         │
    │ SKILL.md│   │  SKILL.md  │  │ SKILL.md│
    │ tools/  │   │  tools/    │  │ tools/  │
    │ prompts/│   │  prompts/  │  │ prompts/│
    └─────────┘   └────────────┘  └─────────┘
```

## The Thin Harness (Complete)

The entire harness fits in a single file:

```python
#!/usr/bin/env python3
"""Thin harness: ~100 lines. All behavior lives in skills."""

import json, os, glob, importlib.util
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-4o"
MAX_TURNS = 25

class Harness:
    def __init__(self, workspace: str):
        self.workspace = workspace
        self.skills_dir = os.path.join(workspace, "skills")
        self.tools = {}       # name → {"schema": ..., "handler": callable}
        self.loaded = set()   # loaded skill names

        # Always-available core tools
        self.register_core_tools()

    def register_core_tools(self):
        """Minimal built-in tools. Everything else comes from skills."""
        self.register("read_file",
            "Read a file's contents",
            {"path": {"type": "string"}},
            lambda args: open(args["path"]).read()
        )
        self.register("write_file",
            "Write content to a file",
            {"path": {"type": "string"}, "content": {"type": "string"}},
            lambda args: (open(args["path"], "w").write(args["content"]),
                         f"Wrote to {args['path']}")[1]
        )
        self.register("load_skill",
            "Load a skill by name to access its tools",
            {"name": {"type": "string"}},
            lambda args: self._load_skill(args["name"])
        )

    def register(self, name, desc, props, handler):
        self.tools[name] = {
            "schema": {
                "type": "function",
                "function": {
                    "name": name,
                    "description": desc,
                    "parameters": {
                        "type": "object",
                        "properties": props,
                        "required": list(props.keys())
                    }
                }
            },
            "handler": handler
        }

    def _load_skill(self, name: str) -> str:
        skill_path = os.path.join(self.skills_dir, name)
        if not os.path.isdir(skill_path):
            return f"Error: Skill '{name}' not found"

        # Load SKILL.md instructions
        md_path = os.path.join(skill_path, "SKILL.md")
        instructions = open(md_path).read() if os.path.exists(md_path) else ""

        # Load tools.py if it exists
        tools_py = os.path.join(skill_path, "tools.py")
        if os.path.exists(tools_py):
            spec = importlib.util.spec_from_file_location(f"skill_{name}", tools_py)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if hasattr(mod, "register"):
                mod.register(self)  # Skill registers its own tools

        self.loaded.add(name)
        return f"Loaded skill: {name}\n\n{instructions}"

    def build_system_prompt(self) -> str:
        parts = [self._load_file("AGENTS.md"), self._load_memory()]

        # Skill menu
        menu = self._build_skill_menu()
        if menu:
            parts.append(menu)

        return "\n\n---\n\n".join(filter(None, parts))

    def _load_file(self, name):
        path = os.path.join(self.workspace, name)
        return open(path).read() if os.path.exists(path) else None

    def _load_memory(self):
        mem_path = os.path.join(self.workspace, "MEMORY.md")
        return open(mem_path).read() if os.path.exists(mem_path) else None

    def _build_skill_menu(self):
        if not os.path.isdir(self.skills_dir):
            return None
        skills = []
        for d in sorted(os.listdir(self.skills_dir)):
            md = os.path.join(self.skills_dir, d, "SKILL.md")
            if os.path.exists(md):
                first_line = open(md).readlines()[0].strip("# \n")
                skills.append(f"- {d}: {first_line}")
        return "# Available Skills\n" + "\n".join(skills) if skills else None

    def run(self, user_message: str) -> str:
        messages = [
            {"role": "system", "content": self.build_system_prompt()},
            {"role": "user", "content": user_message}
        ]
        tool_schemas = [t["schema"] for t in self.tools.values()]

        for _ in range(MAX_TURNS):
            resp = client.chat.completions.create(
                model=MODEL, messages=messages, tools=tool_schemas
            )
            msg = resp.choices[0].message
            messages.append(msg)

            if not msg.tool_calls:
                return msg.content

            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments)
                try:
                    result = self.tools[name]["handler"](args)
                except Exception as e:
                    result = f"Error: {e}"
                messages.append({
                    "role": "tool", "tool_call_id": tc.id, "content": str(result)
                })

            # Refresh tool schemas (skill loading may have added new tools)
            tool_schemas = [t["schema"] for t in self.tools.values()]

        return "Max turns reached."

# Usage
if __name__ == "__main__":
    harness = Harness(workspace=".")
    print(harness.run("Check my GitHub notifications"))
```

## A Skill: tools.py

Skills register their tools by calling back to the harness:

```python
# skills/github/tools.py
import subprocess

def register(harness):
    """Called by the harness when this skill is loaded."""
    harness.register(
        "gh_issues",
        "List GitHub issues. Args: repo (owner/repo), labels (optional)",
        {"repo": {"type": "string"}},
        gh_issues
    )
    harness.register(
        "gh_pr_create",
        "Create a pull request",
        {"title": {"type": "string"}, "body": {"type": "string"}},
        gh_pr_create
    )

def gh_issues(args):
    cmd = f"gh issue list --repo {args['repo']} --json number,title,labels"
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def gh_pr_create(args):
    cmd = f"gh pr create --title '{args['title']}' --body '{args['body']}'"
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout
```

## Thin vs. Monolithic Comparison

```
MONOLITHIC HARNESS                 THIN HARNESS + THICK SKILLS
─────────────────────              ────────────────────────────
harness.py (2,000 lines)          harness.py (100 lines)
├── github tools                   skills/
├── email tools                    ├── github/
├── calendar tools                 │   ├── SKILL.md
├── web search                     │   └── tools.py
├── file management                ├── email/
├── memory logic                   │   ├── SKILL.md
├── all prompt templates           │   └── tools.py
└── error handling for all         ├── calendar/
                                   │   ├── SKILL.md
                                   │   └── tools.py
                                   └── (add more without touching harness)

Change email? Edit 2,000-line file  Change email? Edit skills/email/
Add a tool? Modify the core loop    Add a tool? Drop a new skill/ folder
Test github? Load everything        Test github? Load only that skill
```

## The Key Metric: Lines That Change

When you add a new capability:

| Approach | Files changed | Lines in core modified |
|----------|--------------|----------------------|
| Monolithic | 1 (harness.py) | 50-200 |
| Thin + Skills | 1 (new skill/) | 0 |

When you fix a bug in one tool:

| Approach | Blast radius |
|----------|-------------|
| Monolithic | Could break anything — it's all one file |
| Thin + Skills | Only that skill's directory |

## Common Pitfalls

- **Putting business logic in the harness** — The harness should not know about GitHub, email, or any specific domain. If you're writing `if tool == "github":` in the harness, it belongs in a skill.
- **Skills that depend on harness internals** — Skills should interact through the registration API only. If a skill reaches into `harness._private_method()`, the architecture is leaking.
- **No skill isolation** — A buggy skill shouldn't crash the harness. Wrap skill loading and tool execution in try/except at the harness level.

## Further Reading

- [Unix Philosophy](https://en.wikipedia.org/wiki/Unix_philosophy) — "Do one thing well" — the same principle
- [Plugin Architecture Patterns](https://martinfowler.com/articles/plugin-architecture.html) — Martin Fowler on extensible systems
- [OpenClaw Skills System](https://docs.openclaw.ai) — Production implementation of thin harness + skills
