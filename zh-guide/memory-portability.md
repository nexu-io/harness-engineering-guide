# 记忆可移植性

Agent 的记忆比它的模型更有价值。模型是可替换的——从 GPT-4o 切到 Claude Sonnet，Agent 照样能工作。但如果丢失了 Agent 的记忆，你就失去了它对你的代码库、你的偏好、你的工作流所学到的一切。

问题是：大多数平台以私有格式存储 Agent 记忆，锁在它们的系统里。本指南讲为什么这是个问题，以及基于文件的记忆如何解决它。

## 供应商锁定问题

当 Agent 记忆存在平台内部时会发生什么：

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

想切换到 Platform B？
→ 从零开始。所有记忆丢失。
```

Claude 的记忆将"事实"存为内部 embedding。ChatGPT 的记忆用不透明格式存储键值对。GitHub Copilot 的上下文在私有索引中。这些都不可移植。

这导致了真正的锁定：
- **不能切换模型** — 即使有更好的模型出现，你的记忆被困住了。
- **不能备份** — 如果服务宕机，Agent 的知识随之消失。
- **不能检查** — 你看不到 Agent 到底"记住"了什么，也不能纠正错误。
- **不能组合** — 两个不同的 Agent 不能跨平台共享记忆。

## 基于文件的解决方案

解决方法出人意料地简单：**把记忆存为文件系统中的纯文本文件**。

```
workspace/
├── AGENTS.md          ← Agent 指令（可移植配置）
├── MEMORY.md          ← 长期记忆（策展的知识）
├── memory/
│   ├── 2025-01-15.md  ← 每日会话日志
│   ├── 2025-01-16.md  ← 每日会话日志
│   └── ...
└── wiki/
    ├── index.md       ← 知识库索引
    ├── entities/       ← 人物、项目、公司
    └── concepts/       ← 想法、模式、定义
```

这种方式的优势：

| 特性 | 平台记忆 | 基于文件的记忆 |
|------|----------|----------------|
| **可移植性** | ❌ 锁定在供应商 | ✅ 文件随便拷 |
| **可检查性** | ❌ 不透明 | ✅ 任何编辑器都能看 |
| **备份** | ❌ 依赖平台 | ✅ Git、rsync 随便用 |
| **可编辑性** | ❌ 有限的 API | ✅ 直接编辑 |
| **多 Agent** | ❌ 每个 Agent 独立 | ✅ 共享文件系统 |
| **版本控制** | ❌ 无历史 | ✅ 完整 Git 历史 |

## 记忆文件格式

MEMORY.md 是核心长期记忆文件。它是结构化的 Markdown，任何模型都能读：

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

每日文件记录原始会话细节：

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

## 迁移脚本：Claude Memory → MEMORY.md

如果你要从 Claude 的内置记忆迁移过来：

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

## ChatGPT 记忆迁移

ChatGPT 的记忆导出是 JSON 格式。转换器如下：

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

## 跨 Harness 记忆共享

基于文件的记忆让多个 Harness 能共享同一份知识：

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

## Git 作为记忆版本控制

既然记忆就是文件，版本控制自然就有了：

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

这在私有记忆系统中是不可能的。用文件的话，就是普通的 Git 操作。

## 常见陷阱

- **记忆文件无限增长** — 定期策展 MEMORY.md。删除过时的事实，合并相关条目。设一个目标大小（比如 < 5KB）。
- **每日文件无限积累** — 30 天以上的每日文件归档或压缩。Agent 很少需要它们。
- **假设模型会读完所有内容** — 记忆文件必须能放进 Context Window。如果 MEMORY.md 有 50KB，模型看不到大部分内容。保持聚焦。
- **没有结构** — 把所有东西倒进一个文件，模型很难找到相关的事实。使用分区和分类。

## 延伸阅读

- [什么是 Harness？→](what-is-harness.md) — 记忆在 Harness 架构中的位置
- [三维扩展 →](scaling-dimensions.md) — 记忆作为时间维度的扩展策略
