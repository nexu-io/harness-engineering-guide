---
author: Nexu
---

# Skill 系統

> **核心洞察：** Skill 不是 Tool——它是一組相關 Tool、文件和行為規則打包成的*能力單元*。Skill 系統把"100 個 Tool 塞進每個 Prompt"變成了"按需載入的能力選單"，節省數千 Token 並大幅提升 Tool 選擇準確率。

## 什麼是 Skill？

Tool 是模型可以呼叫的單個函式。**Skill** 是一個打包的能力單元，包含：

- **Tool** —— 一個或多個相關的函式 Schema 和處理器
- **文件** —— 一個 SKILL.md 檔案，說明何時以及如何使用這個 Skill
- **行為規則** —— 模型需要遵循的約束、模式和慣例

```
skill/
├── SKILL.md          # Documentation: when to use, how to use, constraints
├── tools.py          # Tool implementations
└── schema.json       # Tool schemas (or generated from code)
```

例如，一個 `git` Skill 不是暴露一個單一的 `git` Tool——它打包了 `git_status`、`git_diff`、`git_commit`、`git_push`、`git_log`，並包含了 commit message 規範、分支命名和何時需要確認再 push 的文件。

## Skill 與 Tool 的區別

| | Tool | Skill |
|---|------|-------|
| **範圍** | 單個函式 | 一組相關函式 |
| **文件** | 引數描述 | 完整的 SKILL.md，含示例和慣例 |
| **載入方式** | 始終存在或不存在 | 從選單按需載入 |
| **Context 成本** | 每個 Schema 約 100–200 Token | 選單項約 200 Token + 載入後約 1,000 Token |
| **行為規則** | 無 | 可包含約束、工作流、模式 |

這個區別對 Token 經濟很重要。一個有 80 個 Tool 的 Harness 每次 API 呼叫僅 Schema 就要花約 12,000 Token。一個有 15 個 Skill 和 300 Token 選單的 Skill 系統只加載需要的部分。

## SKILL.md 格式

SKILL.md 檔案是 Skill 的使用手冊。模型在 Skill 被載入時讀取它：

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

這個格式給了模型足夠的上下文來正確使用 Skill，而不需要把所有知識塞進 Tool 描述裡。

## Skill 選單模式

不要在啟動時載入所有 Tool，而是給模型呈現一個緊湊的可用 Skill 選單。模型讀取選單，決定需要哪個 Skill，然後載入它：

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

菜單隻花約 150 Token。載入一個 Skill 增加其 SKILL.md（約 500–1,000 Token）和 Tool Schema（約 200–800 Token）。對比預先載入所有 Tool：

```
策略                        Token 數 (8 個 Skill，約 60 個 Tool)
────────────────────────────────────────────────────
全部預先載入:                ~12,000 tokens (每次都是)
Skill 選單 + 載入 2 個:     ~150 + ~2,400 = ~2,550 tokens
────────────────────────────────────────────────────
節省:                       每輪約 9,450 tokens (78%)
```

在 30 輪 Session 中，節省約 280K Token——按 API 定價算是實打實的錢。

## Skill 註冊表實現

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

架構原則：Harness 應該是薄的——只有 Agentic Loop、Context 組裝和 Skill 註冊表。所有領域專業知識都放在 Skill 中：

```
┌─────────────────────────────────────────────────┐
│  Harness（薄）                                    │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Agentic  │  │  Context   │  │    Skill     │ │
│  │  Loop    │  │ Assembler  │  │  Registry    │ │
│  └──────────┘  └───────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ 按需載入
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│  git    │    │  file_ops  │    │  web      │
│  skill  │    │  skill     │    │  skill    │
└─────────┘    └───────────┘    └───────────┘
```

這種分離有實際好處：
- **Skill 可移植** —— 為一個 Harness 寫的 Skill 在另一箇中也能用
- **Skill 可測試** —— 獨立測試 Tool 和 Schema
- **Skill 可組合** —— 模型自然地發現如何組合已載入的 Skill
- **Harness 保持簡單** —— 通過新增 Skill 來增加能力，而不是修改核心

## 常見陷阱

- **啟動時載入所有 Skill** —— 違背了 Skill 系統的初衷。用選單模式按需載入。
- **巨型 Skill** —— 一個有 30 個 Tool 的"萬能" Skill 只是換了個馬甲的全量載入問題。保持 Skill 聚焦：每個 3–8 個 Tool。
- **缺少 SKILL.md** —— 沒有文件的 Tool 迫使模型猜測使用慣例。SKILL.md 不是可選項；它是 Skill 的大腦。
- **沒有解除安裝機制** —— 如果模型載入了五個 Skill 卻無法解除安裝，Context 會很快填滿。始終在 `load_skill` 旁提供 `unload_skill`。
- **Skill 和 Tool 命名混淆** —— 如果 Skill 叫 `git` 且包含一個叫 `git` 的 Tool，模型可能會把 Skill 名當 Tool 名來呼叫。用不同的命名：Skill 叫 `git`，Tool 叫 `git_status`、`git_diff` 等。

## 延伸閱讀

- [OpenClaw Skills Architecture](https://docs.openclaw.ai) — 一個生產級 Skill 系統，含 Skill 選單和按需載入
- [Anthropic: Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Tool 設計最佳實踐，同樣適用於 Skill
- [Model Context Protocol: Tools](https://modelcontextprotocol.io/) — 跨 Harness Tool/Skill 互操作的開放標準
