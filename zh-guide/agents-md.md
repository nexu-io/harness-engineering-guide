# AGENTS.md 模式

AGENTS.md 是一个纯文本文件，定义 AI Agent 应该如何行为。把它放到目录里，任何兼容的 Harness 都会自动读取 — 不需要配置 UI，不需要 API 调用，就是一个文件。

## 为什么重要

在 AGENTS.md 出现之前，Agent 行为通过平台 UI、JSON 配置或分散在代码各处来配置。基于文件的方案解决了三个问题：

1. **版本控制** — Agent 行为存在 Git 里，可以在 PR 中审查
2. **可移植性** — 切换 Harness 实现不需要重写配置
3. **透明性** — 任何人都能看到 Agent 做什么、不做什么

## 基本结构

```markdown
# AGENTS.md

## Role
You are a backend engineer. You write Python, use PostgreSQL,
and follow the project's existing patterns.

## Rules
- Never modify files outside the `src/` directory
- Always run tests before committing
- Ask before deleting any file

## Workflow
1. Read the issue description
2. Explore relevant code with `grep` and `cat`
3. Write the implementation
4. Run `pytest` to verify
5. Commit with a descriptive message
```

这就是一个可用的 AGENTS.md。Agent 在会话开始时读取，全程遵循。

## 真实案例

### Claude Code（Anthropic）

Claude Code 读取 `CLAUDE.md` — 同样的模式，不同的文件名：

```markdown
# CLAUDE.md

## Project
This is a Next.js 14 app with TypeScript, Tailwind, and Prisma.

## Testing
- Run `npm test` for unit tests
- Run `npm run e2e` for Playwright tests
- Always run tests after changes

## Style
- Use functional components with hooks
- Prefer `const` over `let`
- No `any` types — use proper TypeScript types
```

### OpenClaw / Nexu

OpenClaw 使用 `AGENTS.md` 加配套文件：

```markdown
# AGENTS.md

## First Run
Read SOUL.md — this is who you are.
Read USER.md — this is who you're helping.

## Memory
- Daily notes: memory/YYYY-MM-DD.md
- Long-term: MEMORY.md
Capture what matters. Skip secrets.

## Safety
- Don't exfiltrate private data
- trash > rm
- When in doubt, ask
```

配套文件（`SOUL.md`、`USER.md`、`MEMORY.md`）是 Agent 的持久化上下文。Harness 在会话开始时读取它们。

## 进阶用法

### 条件规则

```markdown
## Rules
- In `main` branch: never force-push
- In feature branches: squash commits before PR
- If CI fails: fix it before asking for review
```

### 工具限制

```markdown
## Allowed Tools
- read, write, edit files
- run shell commands (with confirmation for destructive ones)
- web search

## Forbidden
- No direct database writes in production
- No `rm -rf` ever
```

### 多 Agent 设置

```markdown
## Sub-Agents
- Code review: spawn with read-only access
- Test runner: spawn with `npm test` only
- Deploy: requires human approval
```

## 常见陷阱

- **太模糊** — "Be helpful" 没用。"Run `pytest` after every code change" 才有用。
- **太长** — 文件会进 Context Window。每一行都消耗 Token。保持精简。
- **矛盾的规则** — "Always commit" + "Never commit without tests" + "Tests are optional" → Agent 会混乱。

## 生态系统

| Harness | 配置文件 | 自动加载？ |
|---------|---------|----------|
| Claude Code | CLAUDE.md | ✅ |
| OpenClaw | AGENTS.md | ✅ |
| Codex | codex.md | ✅ |
| Aider | .aider.conf.yml | ✅ |
| Cline | .clinerules | ✅ |
| Cursor | .cursorrules | ✅ |

命名各有不同，但模式是通用的：**一个在仓库根目录的、人类可读的文件，定义 Agent 行为**。

## 延伸阅读

- [OpenAI: AGENTS.md as table of contents](https://openai.com/index/harness-engineering/) — OpenAI 在 Codex 中如何使用 AGENTS.md
- [MEMORY.md 模式 →](memory-md.md) — 持久化记忆的配套文件
