# Skill 按需加载

Skill 按需加载的做法是：让 Agent 能访问一个大型工具库，但只加载当前任务需要的工具。不是把所有工具定义一股脑塞进 Context Window，而是让 Agent 先看一个可用 Skill 的菜单，需要时再按需加载。

## 为什么重要

每个工具定义都消耗 Token。典型的工具 schema 占 100-300 Token。如果你的 Agent 始终加载 50 个工具，在任何对话开始之前就要消耗 5,000-15,000 Token — 每次会话都是如此。Skill 按需加载把这个开销降到约 500 Token（菜单）+ 每个实际使用的工具约 300 Token。对于工具集很大的 Agent，这能节省 80-90% 的工具相关 Token 成本。

## SKILL.md 模式

每个 Skill 有自己的目录和一个 `SKILL.md` 文件，描述它能做什么以及如何使用：

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

一个 SKILL.md 文件：

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

## 菜单系统

Agent 看到的不是所有工具，而是一个紧凑的菜单：

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

生成的菜单如下：

```markdown
# Available Skills
Load a skill by name when you need it.

- **calendar**: Create events, manage meetings, and sync across providers.
- **email**: Read and send email via IMAP/SMTP.
- **file-organizer**: Organize files by grouping into folders by extension or date.
- **github**: Interact with GitHub using the `gh` CLI.
- **web-search**: Search the web using multiple engines.
```

**成本**：5 个 Skill 约 150 Token，相比之下加载所有工具 schema 需要 1,500+ Token。

## 加载工具

给 Agent 一个按需加载 Skill 的工具：

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

## Token 成本对比

一个有 20 个 Skill 的实际案例：

```
方案：全部加载
─────────────────────────────────
20 skills × ~250 tokens/tool = 5,000 tokens
× 3 tools avg per skill = 15,000 tokens
每次会话都要付出的成本

方案：菜单 + 按需加载
──────────────────────────────────
菜单:           20 × ~15 tokens = 300 tokens   (每次会话)
加载的 Skill:   2 × ~400 tokens = 800 tokens   (只在使用时)
总计:                            = 1,100 tokens

节省: 每次会话约 13,900 Token（93% 降幅）
按 $3/M input tokens 计: 每次会话省 ~$0.04
每天 1,000 次会话: 每天省 ~$40 = 每月 $1,200
```

## 自动检测模式

更智能的方案是让 Harness 自动判断哪些 Skill 可能相关：

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

## Skill 组合

Skill 之间可以相互引用：

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

Harness 处理传递加载：

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

## 卸载 Skill

对于长会话，可以卸载不再需要的 Skill：

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

## 常见陷阱

- **"以防万一"加载所有 Skill** — 这样做就失去了意义。相信模型能按需加载它需要的东西，或者用保守的关键词列表做自动检测。
- **Skill 描述太模糊** — "Useful utility skill" 对模型毫无帮助。要写具体："Read and send email via IMAP/SMTP. Supports Gmail, Outlook, 163.com."
- **忘记在 system prompt 中包含菜单** — 如果模型不知道有哪些 Skill 存在，它就无法加载。即使没有预加载任何 Skill，菜单也要始终包含。

## 延伸阅读

- [OpenClaw Skills Architecture](https://github.com/anthropics/anthropic-cookbook) — 生产级 Skill 加载系统
- [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334) — LLM 从大型 API 库中选择的研究

---

*下一篇: [薄 Harness 架构 →](thin-harness.md)*
