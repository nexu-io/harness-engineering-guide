---
author: Nexu
---

# 主流 Harness 实现对比

这是截至 2025 年中主要 Agent Harness 的事实性对比。这个领域发展很快——具体细节可能变化，但架构模式是稳定的。

## 总览表

| 项目 | Context 管理 | Memory | Skill / Tool | 多 Agent | 开源 |
|---|---|---|---|---|---|
| **OpenClaw** | AGENTS.md 驱动的 Context 注入。每个 Session 加载工作区文件、Skill 和 Memory。通过摘要进行 Context 压缩。 | 基于文件：MEMORY.md（长期）、日志（memory/YYYY-MM-DD.md）、wiki/ 用于结构化知识。完全可移植。 | Skill 系统：每个 Skill 是 SKILL.md + 支持文件。可从 ClawdHub 安装。支持 MCP 协议。 | Sub-Agent spawn，推送式完成通知。编排器委派任务，结果自动上报。 | ✅ 开源 |
| **Claude Code** | 512K Context Window。按需通过 read Tool 加载文件。CLAUDE.md 用于项目级指令。Context 满时压缩旧消息。 | 基于 Session。默认无跨 Session 持久 Memory。CLAUDE.md 提供项目连续性。用户自管理文件。 | 内置 Tool：read、write、edit、exec、web search。可通过 MCP Server 扩展。权限系统（allow/deny/ask）。 | 单 Agent。无原生 Sub-Agent 支持。可通过 exec 调用其他 CLI 工具。 | ✅ 开源 |
| **Codex (OpenAI CLI)** | 加载仓库结构 + 相关文件。AGENTS.md 用于指令。Sandbox 化执行环境。 | 无持久 Memory。读取项目文件（README、AGENTS.md）获取 Context。每次运行 Session 状态重置。 | 内置：文件读写、exec、web search。默认在禁网 Sandbox 中运行。可按 Session 启用网络。 | 单 Agent。无多 Agent 编排。设计用于单任务执行。 | ✅ 开源 |
| **Cline** | VS Code 扩展。加载打开的文件 + 相关工作区文件。自定义指令文件。滑动窗口管理 Context。 | 无内置持久 Memory。依赖工作区文件和 VS Code Session 内的对话历史。 | 文件操作、终端命令、浏览器自动化。支持 MCP Server 扩展。操作审批工作流。 | 单 Agent。无多 Agent 支持。通过 VS Code 审批提示实现人在回路。 | ✅ 开源 |
| **Aider** | Git 感知 Context。通过 /add 显式添加文件到 Context。Repo map 提供项目全局概览。基于 diff 编辑。 | Git 历史作为隐式 Memory。无专用 Memory 系统。Session 历史在终端 Session 内持续。 | 聚焦的 Tool 集：文件编辑（diff 格式）、Git 操作、lint、测试。无插件系统。 | 单 Agent。无多 Agent。设计用于结对编程（人 + 一个 Agent）。 | ✅ 开源 |
| **Cursor** | IDE 集成。全仓库嵌入索引。基于语义搜索加载相关文件。@-mention 用于显式 Context。 | 无持久 Agent Memory。代码库索引作为隐式知识。.cursorrules 用于项目配置。 | 代码编辑、终端、文件操作、文档查阅。集成调试器 Context。无插件市场。 | 单 Agent。无多 Agent。后台索引是异步的但非 Agent 化。 | ❌ 闭源 |
| **Nexu** | Agent 原生 IM 平台。每个 Agent 有工作区：AGENTS.md、SOUL.md、USER.md、MEMORY.md。Skill 注入专业 Context。 | 完整体系：MEMORY.md（策展式长期）、日志、wiki/ 知识库、TOOLS.md（环境专属笔记）。跨 Session 连续性是设计核心。 | Skill 市场。每个 Skill 自包含，带 SKILL.md 指令。平台级 Tool：日历、邮件、消息、浏览器、摄像头、节点。 | 多 Agent 原生。Sub-Agent spawn、跨频道消息、cron 调度。Agent 可跨 IM 频道协作。 | ❌ 闭源（平台） |

## 深入对比：关键差异

### Context 策略

各 Harness 如何决定给模型看什么：

```
Aider          : 显式 — 用户手动添加文件 (/add, /drop)
Claude Code    : 按需 — Agent 按需读取文件
Cursor         : 语义 — 嵌入索引，自动检索相关代码
OpenClaw/Nexu  : 配置驱动 — AGENTS.md 声明加载什么
Codex          : 仓库感知 — 扫描结构，加载相关文件
Cline          : IDE 感知 — 打开的标签页 + 工作区文件
```

**权衡：** 显式控制（Aider）精确但需要用户操作。语义检索（Cursor）自动但可能遗漏或包含错误文件。配置驱动（OpenClaw）可预测但需要前期配置。

### Memory 架构

```python
# 类型 1: 无 Memory (Claude Code, Codex, Cursor, Cline)
# 每个 Session 从零开始。Context 来自项目文件。
context = load_project_files()  # That's it

# 类型 2: 基于文件的 Memory (OpenClaw, Nexu)
# 跨 Session 的持久知识，用户可编辑。
context = (
    load_project_files()
    + load_memory("MEMORY.md")
    + load_daily_log(today)
    + load_wiki_if_relevant(task)
)

# 类型 3: 嵌入式 Memory（闭源平台）
# 存储在向量数据库中，按相似度检索。
context = (
    load_project_files()
    + vector_search(task, memory_store)
)
```

### Tool 可扩展性

| 方式 | 项目 | 优点 | 缺点 |
|---|---|---|---|
| **MCP 协议** | OpenClaw、Claude Code、Cline | 标准协议，可互操作 | Server 配置开销 |
| **Skill 文件** | OpenClaw、Nexu | 自包含、可分享、有市场 | 自定义格式 |
| **仅内置** | Aider、Codex | 简单、可预测 | 扩展性有限 |
| **IDE 集成** | Cursor、Cline | 丰富的编辑器 Context | 绑定 IDE |

### 多 Agent 模式

大多数 Harness 是单 Agent 的。多 Agent 支持差异很大：

```python
# OpenClaw/Nexu: 一等公民的 Sub-Agent spawn
subagent = spawn(
    task="Research competitor pricing",
    model="gpt-4o",
    tools=["web_search", "web_fetch"],
)
# Result auto-announces when done — no polling needed

# Claude Code: 通过 exec 间接实现多 Agent
result = exec("claude-code --print 'Review this PR'")
# Works but no structured communication

# Others: 无原生多 Agent
# Workaround: multiple terminal sessions, manual coordination
```

## 如何选择合适的 Harness

| 如果你需要... | 考虑 |
|---|---|
| 深度代码编辑 + IDE 集成 | **Cursor** 或 **Cline** |
| 终端编码 Agent | **Claude Code** 或 **Aider** |
| Sandbox 化任务执行 | **Codex** |
| 多 Agent 编排 | **OpenClaw** 或 **Nexu** |
| 跨 Session 持久 Memory | **OpenClaw** 或 **Nexu** |
| 可扩展的 Tool 生态 | **OpenClaw**（Skill + MCP） |
| 最小配置、开箱即用 | **Aider** |

## 表格没有展示的

- **模型支持** —— 大多数 Harness 不绑定模型（OpenClaw、Cline、Aider 支持多家供应商）。Codex 仅支持 OpenAI。Claude Code 以 Anthropic 为主。
- **成本** —— 差异很大，取决于模型选择、Context 大小和任务复杂度。不是 Harness 特性，而是使用模式。
- **速度** —— 更多取决于模型延迟而非 Harness 架构。流式支持是通用的。
- **社区** —— 开源项目（Aider、Claude Code、Cline、OpenClaw）都有活跃社区。社区大小不等于质量。

## 常见陷阱

- **跟风选择** —— 选适合你工作流的 Harness，不是 GitHub star 最多的。
- **忽视 Memory** —— 如果你的任务跨 Session，没有持久 Memory 的 Harness 意味着每次都要重新解释 Context。
- **认为"开源"等于"免费"** —— Harness 是免费的；模型 API 调用不是。做好 API 成本预算。

## 延伸阅读

- [术语表 →](/guide/glossary) — 本指南使用的核心术语
