---
author: Nexu
---

# Skill 系统

> **核心洞察：** Skill 不是 Tool——它是一组相关 Tool、文档和行为规则打包成的*能力单元*。Skill 系统把"100 个 Tool 塞进每个 Prompt"变成了"按需加载的能力菜单"，节省数千 Token 并大幅提升 Tool 选择准确率。

## 什么是 Skill？

Tool 是模型可以调用的单个函数。**Skill** 是一个打包的能力单元，包含：

- **Tool** —— 一个或多个相关的函数 Schema 和处理器
- **文档** —— 一个 SKILL.md 文件，说明何时以及如何使用这个 Skill
- **行为规则** —— 模型需要遵循的约束、模式和惯例

```
skill/
├── SKILL.md          # Documentation: when to use, how to use, constraints
├── tools.py          # Tool implementations
└── schema.json       # Tool schemas (or generated from code)
```

例如，一个 `git` Skill 不是暴露一个单一的 `git` Tool——它打包了 `git_status`、`git_diff`、`git_commit`、`git_push`、`git_log`，并包含了 commit message 规范、分支命名和何时需要确认再 push 的文档。

## Skill 与 Tool 的区别

| | Tool | Skill |
|---|------|-------|
| **范围** | 单个函数 | 一组相关函数 |
| **文档** | 参数描述 | 完整的 SKILL.md，含示例和惯例 |
| **加载方式** | 始终存在或不存在 | 从菜单按需加载 |
| **Context 成本** | 每个 Schema 约 100–200 Token | 菜单项约 200 Token + 加载后约 1,000 Token |
| **行为规则** | 无 | 可包含约束、工作流、模式 |

这个区别对 Token 经济很重要。一个有 80 个 Tool 的 Harness 每次 API 调用仅 Schema 就要花约 12,000 Token。一个有 15 个 Skill 和 300 Token 菜单的 Skill 系统只加载需要的部分。

## SKILL.md 格式

SKILL.md 文件是 Skill 的使用手册。模型在 Skill 被加载时读取它：

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

这个格式给了模型足够的上下文来正确使用 Skill，而不需要把所有知识塞进 Tool 描述里。

## Skill 菜单模式

不要在启动时加载所有 Tool，而是给模型呈现一个紧凑的可用 Skill 菜单。模型读取菜单，决定需要哪个 Skill，然后加载它：

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

菜单只花约 150 Token。加载一个 Skill 增加其 SKILL.md（约 500–1,000 Token）和 Tool Schema（约 200–800 Token）。对比预先加载所有 Tool：

```
策略                        Token 数 (8 个 Skill，约 60 个 Tool)
────────────────────────────────────────────────────
全部预先加载:                ~12,000 tokens (每次都是)
Skill 菜单 + 加载 2 个:     ~150 + ~2,400 = ~2,550 tokens
────────────────────────────────────────────────────
节省:                       每轮约 9,450 tokens (78%)
```

在 30 轮 Session 中，节省约 280K Token——按 API 定价算是实打实的钱。

## Skill 注册表实现

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

## 薄 Harness + 厚 Skill

架构原则：Harness 应该是薄的——只有 Agentic Loop、Context 组装和 Skill 注册表。所有领域专业知识都放在 Skill 中：

```
┌─────────────────────────────────────────────────┐
│  Harness（薄）                                    │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Agentic  │  │  Context   │  │    Skill     │ │
│  │  Loop    │  │ Assembler  │  │  Registry    │ │
│  └──────────┘  └───────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ 按需加载
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│  git    │    │  file_ops  │    │  web      │
│  skill  │    │  skill     │    │  skill    │
└─────────┘    └───────────┘    └───────────┘
```

这种分离有实际好处：
- **Skill 可移植** —— 为一个 Harness 写的 Skill 在另一个中也能用
- **Skill 可测试** —— 独立测试 Tool 和 Schema
- **Skill 可组合** —— 模型自然地发现如何组合已加载的 Skill
- **Harness 保持简单** —— 通过添加 Skill 来增加能力，而不是修改核心

## 常见陷阱

- **启动时加载所有 Skill** —— 违背了 Skill 系统的初衷。用菜单模式按需加载。
- **巨型 Skill** —— 一个有 30 个 Tool 的"万能" Skill 只是换了个马甲的全量加载问题。保持 Skill 聚焦：每个 3–8 个 Tool。
- **缺少 SKILL.md** —— 没有文档的 Tool 迫使模型猜测使用惯例。SKILL.md 不是可选项；它是 Skill 的大脑。
- **没有卸载机制** —— 如果模型加载了五个 Skill 却无法卸载，Context 会很快填满。始终在 `load_skill` 旁提供 `unload_skill`。
- **Skill 和 Tool 命名混淆** —— 如果 Skill 叫 `git` 且包含一个叫 `git` 的 Tool，模型可能会把 Skill 名当 Tool 名来调用。用不同的命名：Skill 叫 `git`，Tool 叫 `git_status`、`git_diff` 等。

## 延伸阅读

- [OpenClaw Skills Architecture](https://docs.openclaw.ai) — 一个生产级 Skill 系统，含 Skill 菜单和按需加载
- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Tool 设计最佳实践，同样适用于 Skill
- [Model Context Protocol: Tools](https://modelcontextprotocol.io/) — 跨 Harness Tool/Skill 互操作的开放标准
