# MEMORY.md 模式

MEMORY.md 是一个纯文本文件，赋予 AI Agent 跨会话的持久记忆。Agent 在启动时读取它，工作中更新它，并随时间推移进行整理 — 就像人类的长期记忆存储在一个 Markdown 文件里。

## 为什么重要

LLM 是无状态的。每次 API 调用都从零开始 — 不记得昨天的对话，不知道用户偏好，不记得过去的错误。MEMORY.md 用最简单的机制解决了这个问题：一个文件。不需要向量数据库，不需要 embedding，不需要基础设施。就是一个 Agent 读写的 Markdown 文件。

## 文件结构

生产级记忆系统有两层：

```
project/
├── MEMORY.md                    # Curated long-term memory
└── memory/
    ├── 2025-07-10.md            # Today's raw log
    ├── 2025-07-09.md            # Yesterday
    ├── 2025-07-08.md            # Day before
    └── heartbeat-state.json     # Metadata for periodic checks
```

**MEMORY.md** — 精心整理、高信噪比。相当于你大脑的长期记忆。由 Agent 定期回顾每日日志并提取值得保留的内容来更新。

**memory/YYYY-MM-DD.md** — 原始每日日志。发生了什么、做了什么决定、解决了什么问题。相当于日记。

## 一个真实的 MEMORY.md

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

## 一个真实的每日日志

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

## Harness 如何使用记忆

### 会话启动时加载

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

### 写入每日日志

给 Agent 一个追加今日日志的工具：

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

### 整理长期记忆

定期（每天或通过 heartbeat），Agent 回顾近期日志并更新 MEMORY.md：

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

## Token 预算

记忆和其他所有东西竞争 Context Window 空间：

```
128K context window (GPT-4o)
├── System prompt:     ~500 tokens
├── MEMORY.md:         ~700 tokens (target)
├── Daily logs (2d):   ~1,000 tokens
├── Active files:      ~10,000 tokens
├── Conversation:      ~50,000 tokens
└── Remaining:         ~65,800 tokens (for model output + headroom)
```

核心约束：MEMORY.md 应该**精简到每次会话都能加载**，不会显著影响 Token 预算。500 词（~700 Token）是一个好的目标。如果超过 1,000 词，就该精简了。

## 记忆卫生

### 应该放进 MEMORY.md 的

- 用户偏好和工作习惯
- 项目相关事实（命令、URL、惯例）
- 从过去错误中学到的教训
- 关键决定及其理由

### 不应该放进去的

- 临时任务状态（用每日日志）
- 大段代码片段（链接到文件）
- 密钥、API key、密码（永远不要）
- 逐字对话记录（改用摘要）

## 常见陷阱

- **让 MEMORY.md 无限增长** — 不做整理的话，它会变成所有事情的垃圾堆。在整理步骤中设定字数上限并严格执行。
- **加载太多天的每日日志** — 每个每日日志可能 500-1,000 Token。加载一周的内容每次会话就要吃掉 5K+ Token。只加载今天和昨天；其余应该被整理进 MEMORY.md。
- **在记忆文件中存储密钥** — 记忆文件是纯文本，经常被提交到 Git。永远不要在里面存 API key、密码或 Token。

## 延伸阅读

- [OpenClaw AGENTS.md Memory Pattern](https://github.com/anthropics/anthropic-cookbook) — Agent 持久化的配套文件
- [Letta (MemGPT)](https://github.com/letta-ai/letta) — 更复杂的分层存储记忆管理
- [记忆可移植性 →](memory-portability.md) — 在不同 Harness 实现之间迁移记忆
