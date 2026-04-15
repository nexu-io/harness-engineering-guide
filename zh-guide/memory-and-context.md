---
author: Nexu
---

# Memory 与 Context

> **Core Insight:** 模型只知道 Context 窗口中的内容。Memory 是连接模型*需要知道的*和它在单次 API 调用中*能看到的*之间的桥梁。把这件事做对，是 Harness 工程中杠杆最高的问题。

## 三个不同的概念

这些术语经常被混淆，但它们有不同的用途：

| 概念 | 范围 | 持久性 | 示例 |
|---------|-------|-------------|---------|
| **Context** | 单次 API 调用 | 无——每轮重建 | 系统提示 + Tool + 最近消息 + 相关文件 |
| **Session** | 单次对话或任务 | 内存中，重启即丢失 | 消息历史、Tool 调用结果、工作状态 |
| **Memory** | 跨 Session，无限期 | 写入磁盘 | MEMORY.md、每日日志、学习到的偏好 |

**Context** 是模型的"工作记忆"——组装进单次 prompt 的所有内容。**Session** 是一次进行中的交互状态。**Memory** 是 Session 结束后留存下来的东西。

## Context 组装

Agentic Loop 的每一轮都从组装 Context 开始。这是一个有优先级的装箱问题——你有固定的 Token 预算，必须决定放什么进去：

```
Context 窗口（如 128K Token）
┌─────────────────────────────────┐
│  System Prompt        (~500)    │  ← 始终包含，最高优先级
│  Tool Schemas         (~2000)   │  ← 仅活跃 Tool
│  Memory Summary       (~1000)   │  ← 压缩的长期 Memory
│  Relevant Files       (~5000)   │  ← 任务相关 Context
│  Conversation History (~varies) │  ← 随时间增长，需要裁剪
│  [Remaining Budget]             │  ← 可用于新内容
└─────────────────────────────────┘
```

优先级系统决定空间紧张时包含什么：

```python
class ContextAssembler:
    def __init__(self, max_tokens: int = 128_000):
        self.max_tokens = max_tokens
        self.sections = []  # (priority, name, content)

    def add(self, priority: int, name: str, content: str):
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        # Sort by priority (lower = higher priority)
        self.sections.sort(key=lambda x: x[0])
        messages = []
        used_tokens = 0
        for priority, name, content in self.sections:
            token_count = estimate_tokens(content)
            if used_tokens + token_count > self.max_tokens:
                break  # Budget exceeded — skip lower-priority content
            messages.append({"role": "system", "content": f"[{name}]\n{content}"})
            used_tokens += token_count
        return messages
```

## Session 管理

Session 是单次 Agent 运行的边界，包含：

- **消息历史** —— 完整对话，包括 Tool 调用和结果
- **工作状态** —— 哪些文件打开了、加载了哪些 Skill、当前任务进度
- **临时空间** —— Agent 生成但尚未提交的临时数据

Session 设计的关键选择是**什么时候清除它**。几种方案：

| 策略 | 行为 | 适用场景 |
|----------|----------|----------|
| **按任务** | 每个用户请求新开 Session | 无状态助手 |
| **按对话** | Session 在一次聊天的多轮中保持 | 交互式编码 |
| **持久化** | Session 在进程重启后仍存活 | 长期运行的后台 Agent |

持久化 Session 需要序列化——将 Session 状态写入磁盘以便恢复。这是 Session 和 Memory 重叠的地方：任何值得在重启后保留的内容，都应该写入 Memory 文件而非保存在 Session 状态中。

## Memory 架构

经过验证的 Memory 架构采用两级结构：

### 第一级：每日日志

原始的、按时间顺序的事件记录。在 Session 中写入，不做精选：

```markdown
<!-- memory/2026-04-15.md -->
# 2026-04-15

## 14:30 — Refactored auth module
- Moved JWT validation from middleware to dedicated service
- Tests passing (23/23)
- User prefers explicit error messages over error codes

## 16:00 — Deploy to staging
- Used blue-green deployment
- Rollback plan: revert commit abc123
```

### 第二级：长期 Memory

精选过的、提炼出的知识。定期更新（不是每个 Session）：

```markdown
<!-- MEMORY.md -->
# Long-term Memory

## User Preferences
- Prefers explicit error messages over error codes
- Uses pytest, not unittest
- Deploy strategy: blue-green with rollback plan

## Project Knowledge
- Auth module: JWT validation in /src/services/auth.py
- Database: PostgreSQL 15, migrations in /db/migrations/
- CI: GitHub Actions, ~3min build time

## Lessons Learned
- Always run tests before committing (broke build on 4/10)
- User dislikes verbose output — keep summaries under 5 lines
```

关键洞察：每日日志写起来成本很低（追加就行）。长期 Memory 需要判断力（什么值得保留？）。生产级 Harness 自动写每日日志，定期整理 MEMORY.md——按计划或在 Agent 检测到重要发现时触发。

## Memory 读写周期

```python
def session_startup(memory_dir: str) -> str:
    """Read memory at session start."""
    sections = []
    # Always read long-term memory
    memory_path = os.path.join(memory_dir, "MEMORY.md")
    if os.path.exists(memory_path):
        sections.append(open(memory_path).read())
    # Read recent daily logs (today + yesterday)
    for days_ago in [0, 1]:
        date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        daily_path = os.path.join(memory_dir, f"memory/{date}.md")
        if os.path.exists(daily_path):
            sections.append(open(daily_path).read())
    return "\n---\n".join(sections)
```

## AGENTS.md 模式

一个相关但不同的文件是 AGENTS.md——一个纯文本文件，定义 Agent 应该*如何行为*（而非它*记住什么*）。放在任意目录下，兼容的 Harness 会自动读取它：

```markdown
<!-- AGENTS.md -->
# Behavior

- You are a Python backend engineer
- Use pytest for all tests
- Follow Google style docstrings
- Never modify files in /config/ without asking

# Tools

- Prefer `ruff` over `pylint` for linting
- Use `uv` for package management
```

AGENTS.md 是**声明式的**（做什么），MEMORY.md 是**经验式的**（发生了什么）。两者都在 Session 启动时注入 Context，但用途不同。

## 常见误区

- **把 Context 当成无限的** —— 即使 128K Token 也会被 Tool Schema、文件内容和对话历史快速填满。显式规划你的 Token 预算。
- **从不裁剪 Session 历史** —— 50 轮对话会累积大量冗余内容。压缩或摘要旧轮次以回收空间。
- **过于频繁地写 Memory** —— 不是每一轮都会产出值得持久化的知识。过度写入会产生噪音，稀释有用信息。
- **启动时忘记读 Memory** —— 不读 Memory 的 Agent 就是失忆的。这是最常见的配置 bug。

## 延伸阅读

- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) —— 受操作系统启发的 Agent Memory 管理
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— 生产中的 Memory 模式
