# Skill Loading

Skill loading is the practice of giving an agent access to a large library of tools but only loading the ones needed for the current task. Instead of stuffing every tool definition into the context window upfront, the agent reads a menu of available skills and loads them on demand.

## Why It Matters

Every tool definition costs tokens. A typical tool schema is 100-300 tokens. If your agent has 50 tools loaded at all times, that's 5,000-15,000 tokens consumed before any conversation starts — every single session. Skill loading cuts this to ~500 tokens for the menu plus ~300 tokens per tool actually used. For agents with large toolsets, this saves 80-90% of tool-related token costs.

## The SKILL.md Pattern

Each skill lives in its own directory with a `SKILL.md` file that describes what it does and how to use it:

```
skills/
├── github/
│   └── SKILL.md
├── email/
│   └── SKILL.md
├── calendar/
│   └── SKILL.md
├── web-search/
│   └── SKILL.md
└── file-organizer/
    └── SKILL.md
```

A SKILL.md file:

```markdown
# GitHub Skill

Interact with GitHub using the `gh` CLI.

## Tools
- `gh issue list` — List open issues
- `gh pr create` — Create a pull request
- `gh pr review` — Review a PR
- `gh run list` — Check CI status

## Setup
Requires `gh` CLI installed and authenticated (`gh auth login`).

## Examples
- "List all open bugs" → `gh issue list --label bug`
- "Create a PR for this branch" → `gh pr create --fill`

## Configuration
```yaml
default_repo: owner/repo
labels: [bug, feature, docs]
```
```

## The Menu System

Instead of loading all tools, the agent sees a compact menu:

```python
import os, glob

def build_skill_menu(skills_dir: str) -> str:
    """Generate a one-line-per-skill menu for the system prompt."""
    menu_lines = ["# Available Skills", "Load a skill by name when you need it.\n"]

    for skill_dir in sorted(glob.glob(os.path.join(skills_dir, "*/"))):
        name = os.path.basename(skill_dir.rstrip("/"))
        skill_md = os.path.join(skill_dir, "SKILL.md")
        if os.path.exists(skill_md):
            # Extract first paragraph as description
            with open(skill_md) as f:
                lines = f.readlines()
                desc = ""
                for line in lines[1:]:  # Skip title
                    line = line.strip()
                    if line:
                        desc = line
                        break
            menu_lines.append(f"- **{name}**: {desc}")

    return "\n".join(menu_lines)
```

This produces a menu like:

```markdown
# Available Skills
Load a skill by name when you need it.

- **calendar**: Create events, manage meetings, and sync across providers.
- **email**: Read and send email via IMAP/SMTP.
- **file-organizer**: Organize files by grouping into folders by extension or date.
- **github**: Interact with GitHub using the `gh` CLI.
- **web-search**: Search the web using multiple engines.
```

**Cost**: ~150 tokens for 5 skills, vs ~1,500+ tokens if all tool schemas were loaded.

## The Load Tool

Give the agent a tool to load a skill when needed:

```python
LOADED_SKILLS = {}

def load_skill(skills_dir: str, name: str) -> dict:
    """Load a skill's SKILL.md and register its tools."""
    skill_md = os.path.join(skills_dir, name, "SKILL.md")
    if not os.path.exists(skill_md):
        return {"error": f"Skill '{name}' not found"}

    with open(skill_md) as f:
        content = f.read()

    LOADED_SKILLS[name] = content
    return {"loaded": name, "instructions": content}

# Tool definition for the model
SKILL_LOADER_TOOL = {
    "type": "function",
    "function": {
        "name": "load_skill",
        "description": "Load a skill by name to get its tools and instructions",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill name from the available skills menu"
                }
            },
            "required": ["name"]
        }
    }
}
```

## Token Cost Comparison

A real-world example with 20 skills:

```
Approach: All tools loaded at once
─────────────────────────────────
20 skills × ~250 tokens/tool = 5,000 tokens
× 3 tools avg per skill = 15,000 tokens
Per session, every session

Approach: Menu + on-demand loading
──────────────────────────────────
Menu:           20 × ~15 tokens = 300 tokens   (every session)
Loaded skills:  2 × ~400 tokens = 800 tokens   (only when used)
Total:                           = 1,100 tokens

Savings: ~13,900 tokens per session (93% reduction)
At $3/M input tokens: saves ~$0.04 per session
At 1,000 sessions/day: saves ~$40/day = $1,200/month
```

## Auto-Detection Pattern

For a smarter approach, let the harness auto-detect which skills might be relevant:

```python
import re

def auto_suggest_skills(user_message: str, skills_dir: str) -> list[str]:
    """Suggest skills based on keywords in the user's message."""
    keyword_map = {
        "github": ["github", "pr", "pull request", "issue", "commit", "repo"],
        "email": ["email", "mail", "inbox", "send", "reply"],
        "calendar": ["calendar", "meeting", "schedule", "event", "appointment"],
        "web-search": ["search", "find", "look up", "google", "research"],
    }

    message_lower = user_message.lower()
    suggested = []

    for skill, keywords in keyword_map.items():
        if any(kw in message_lower for kw in keywords):
            skill_path = os.path.join(skills_dir, skill, "SKILL.md")
            if os.path.exists(skill_path):
                suggested.append(skill)

    return suggested

# In the harness, pre-load suggested skills
suggestions = auto_suggest_skills(user_message, "skills/")
for skill_name in suggestions:
    load_skill("skills/", skill_name)
```

## Skill Composition

Skills can reference other skills:

```markdown
# Deploy Skill

Deploy static websites to Cloudflare Pages.

## Dependencies
- Requires: **github** skill (for repo access)
- Optional: **web-search** skill (for checking deployment status)

## Workflow
1. Load the github skill first
2. Build the project
3. Deploy with `wrangler pages deploy`
```

The harness handles transitive loading:

```python
def load_skill_with_deps(skills_dir: str, name: str) -> list[str]:
    """Load a skill and its dependencies."""
    loaded = []
    content = load_skill(skills_dir, name)

    # Parse dependencies from SKILL.md
    deps = re.findall(r'Requires:.*?\*\*(\w[\w-]*)\*\*', content.get("instructions", ""))
    for dep in deps:
        if dep not in LOADED_SKILLS:
            load_skill(skills_dir, dep)
            loaded.append(dep)

    loaded.append(name)
    return loaded
```

## Unloading Skills

For long sessions, unload skills that are no longer needed:

```python
def unload_skill(name: str) -> str:
    """Remove a skill from the active context."""
    if name in LOADED_SKILLS:
        del LOADED_SKILLS[name]
        return f"Unloaded skill: {name}"
    return f"Skill '{name}' was not loaded"

def get_active_context() -> str:
    """Build the current skill context for the system prompt."""
    if not LOADED_SKILLS:
        return "No skills currently loaded."

    parts = [f"## Active Skill: {name}\n{content}"
             for name, content in LOADED_SKILLS.items()]
    return "\n\n---\n\n".join(parts)
```

## Common Pitfalls

- **Loading all skills "just in case"** — This defeats the purpose. Trust the model to load what it needs, or use auto-detection with a conservative keyword list.
- **Skill descriptions that are too vague** — "Useful utility skill" tells the model nothing. Be specific: "Read and send email via IMAP/SMTP. Supports Gmail, Outlook, 163.com."
- **Forgetting to include the menu in the system prompt** — If the model doesn't know skills exist, it can't load them. Always include the menu even when no skills are pre-loaded.

## Further Reading

- [OpenClaw Skills Architecture](https://github.com/anthropics/anthropic-cookbook) — Production skill loading system
- [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334) — Research on LLMs selecting from large API libraries
