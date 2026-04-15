# 薄 Harness + 厚 Skill

薄 Harness 是一个最小化的运行时，只做三件事：管理 Tool Loop、组装上下文、分发工具调用。所有领域逻辑、专业行为和复杂工作流都放在 Skill 文件里，由 Harness 按需加载。Harness 是骨架；Skill 是肌肉。

## 为什么重要

单体 Harness 把所有东西都塞在一个代码库里 — 工具、prompt、记忆逻辑、错误处理。这样很脆弱：改邮件功能可能把 GitHub 功能搞坏。薄 Harness 将运行时和行为解耦，Skill 可以独立增删改而不碰核心循环。OpenClaw、Claude Code 以及大多数生产级 Agent 系统都是这样构建的。

## 架构

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

## 薄 Harness（完整版）

整个 Harness 放在一个文件里：

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

## 一个 Skill: tools.py

Skill 通过回调 Harness 来注册自己的工具：

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

## 薄 Harness vs. 单体对比

```
单体 HARNESS                       薄 HARNESS + 厚 SKILL
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

改邮件功能？编辑 2,000 行的文件      改邮件功能？编辑 skills/email/
加个工具？修改核心循环                加个工具？新增一个 skill/ 目录
测试 github？加载所有东西            测试 github？只加载那一个 Skill
```

## 核心指标：变更的代码行数

当你添加新能力时：

| 方案 | 变更文件数 | 核心代码修改行数 |
|------|-----------|----------------|
| 单体 | 1 (harness.py) | 50-200 |
| 薄 + Skill | 1 (new skill/) | 0 |

当你修复某个工具的 bug 时：

| 方案 | 影响范围 |
|------|---------|
| 单体 | 可能影响一切 — 都在同一个文件里 |
| 薄 + Skill | 只影响那个 Skill 的目录 |

## 常见陷阱

- **把业务逻辑写进 Harness** — Harness 不应该知道 GitHub、邮件或任何特定领域。如果你在 Harness 里写 `if tool == "github":`，那它应该放进 Skill 里。
- **Skill 依赖 Harness 内部实现** — Skill 应该只通过注册 API 与 Harness 交互。如果一个 Skill 访问 `harness._private_method()`，架构就泄漏了。
- **没有 Skill 隔离** — 一个有 bug 的 Skill 不应该搞崩 Harness。在 Harness 层面用 try/except 包住 Skill 加载和工具执行。

## 延伸阅读

- [Unix Philosophy](https://en.wikipedia.org/wiki/Unix_philosophy) — "做好一件事" — 同样的原则
- [Plugin Architecture Patterns](https://martinfowler.com/articles/plugin-architecture.html) — Martin Fowler 关于可扩展系统的论述
- [OpenClaw Skills System](https://docs.openclaw.ai) — 薄 Harness + Skill 的生产级实现

---

*下一篇: [上下文窗口管理 →](context-window.md)*
