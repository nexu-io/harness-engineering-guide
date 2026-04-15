# 主流 Harness 实现对比

这是截至 2025 年中主要 Agent Harness 的事实性对比。这个领域变化很快——细节可能过时，但架构模式是稳定的。

## 概览表

| 项目 | 上下文管理 | 记忆 | Skill / 工具 | 多 Agent | 开源 |
|---|---|---|---|---|---|
| **OpenClaw** | 基于 AGENTS.md 的上下文注入。每次会话加载工作区文件、Skill 和记忆。通过摘要实现上下文压缩。 | 基于文件：MEMORY.md（长期）、每日日志（memory/YYYY-MM-DD.md）、wiki/ 存放结构化知识。完全可迁移。 | Skill 体系：每个 Skill 由 SKILL.md + 支撑文件组成。可从 ClawdHub 安装。支持 MCP 协议。 | 子 Agent 生成，完成后推送通知。协调者委派任务，结果自动回报。 | ✅ 开源 |
| **Claude Code** | 512K Context Window。按需通过 read 工具加载文件。CLAUDE.md 提供项目级指令。上下文满时压缩旧消息。 | 基于会话。默认不支持跨会话持久记忆。CLAUDE.md 提供项目连续性。用户自行管理文件。 | 内置工具：read、write、edit、exec、web search。可通过 MCP 服务器扩展。权限系统（allow/deny/ask）。 | 单 Agent。不支持原生子 Agent。可通过 exec 调用其他 CLI 工具。 | ✅ 开源 |
| **Codex (OpenAI CLI)** | 加载仓库结构和相关文件。AGENTS.md 提供指令。沙箱执行环境。 | 无持久记忆。读取项目文件（README、AGENTS.md）获取上下文。每次运行会话状态重置。 | 内置：文件读写、exec、web search。默认在禁用网络的沙箱中运行。可按会话启用网络。 | 单 Agent。不支持多 Agent 编排。设计为单任务执行。 | ✅ 开源 |
| **Cline** | VS Code 扩展。加载打开的文件和相关工作区文件。自定义指令文件。滑动窗口管理上下文。 | 无内置持久记忆。依赖工作区文件和 VS Code 会话内的对话历史。 | 文件操作、终端命令、浏览器自动化。支持 MCP 服务器扩展。通过 VS Code 内的审批流程进行操作确认。 | 单 Agent。不支持多 Agent。通过 VS Code 中的审批提示实现人机协作。 | ✅ 开源 |
| **Aider** | Git 感知上下文。通过 /add 显式添加文件到上下文。仓库地图提供项目全局概览。基于 diff 编辑。 | Git 历史作为隐式记忆。无专用记忆系统。会话历史在终端会话内持久。 | 聚焦的工具集：文件编辑（diff 格式）、Git 操作、lint、测试。无插件系统。 | 单 Agent。不支持多 Agent。设计为结对编程（人 + 一个 Agent）。 | ✅ 开源 |
| **Cursor** | IDE 集成。基于 embedding 的全仓库索引。根据语义搜索加载相关文件。通过 @-mention 显式指定上下文。 | 无持久 Agent 记忆。代码库索引作为隐式知识。.cursorrules 用于项目配置。 | 代码编辑、终端、文件操作、文档查找。集成调试器上下文。无插件市场。 | 单 Agent。不支持多 Agent。后台索引是异步的但不基于 Agent。 | ❌ 闭源 |
| **Nexu** | Agent 原生 IM 平台。每个 Agent 拥有独立工作区：AGENTS.md、SOUL.md、USER.md、MEMORY.md。Skill 注入专业上下文。 | 完整体系：MEMORY.md（长期精选）、每日日志、wiki/ 知识库、TOOLS.md（环境相关笔记）。跨会话连续性是核心设计。 | Skill 市场。每个 Skill 自包含，带有 SKILL.md 指令。平台级工具：日历、邮件、消息、浏览器、相机、节点。 | 原生多 Agent。子 Agent 生成、跨频道消息、定时任务。Agent 可跨 IM 频道协作。 | ❌ 闭源（平台） |

## 深入解析：核心差异

### 上下文策略

各 Harness 如何决定给模型展示什么：

```
Aider          : 显式 — 用户手动添加文件（/add, /drop）
Claude Code    : 按需 — Agent 根据需要读取文件
Cursor         : 语义 — embedding 索引，自动检索相关代码
OpenClaw/Nexu  : 配置驱动 — AGENTS.md 声明加载内容
Codex          : 仓库感知 — 扫描结构，加载相关文件
Cline          : IDE 感知 — 打开的标签页 + 工作区文件
```

**权衡：** 显式控制（Aider）精确但需要用户操作。语义检索（Cursor）自动但可能遗漏或引入错误文件。配置驱动（OpenClaw）可预测但需要前期配置。

### 记忆架构

```python
# 类型 1：无记忆（Claude Code, Codex, Cursor, Cline）
# 每次会话从零开始。上下文来自项目文件。
context = load_project_files()  # That's it

# 类型 2：基于文件的记忆（OpenClaw, Nexu）
# 跨会话持久化知识，用户可编辑。
context = (
    load_project_files()
    + load_memory("MEMORY.md")
    + load_daily_log(today)
    + load_wiki_if_relevant(task)
)

# 类型 3：嵌入式记忆（闭源平台）
# 存储在向量数据库中，按相似度检索。
context = (
    load_project_files()
    + vector_search(task, memory_store)
)
```

### 工具扩展性

| 方式 | 项目 | 优点 | 缺点 |
|---|---|---|---|
| **MCP 协议** | OpenClaw, Claude Code, Cline | 标准协议，可互操作 | 服务器配置有开销 |
| **Skill 文件** | OpenClaw, Nexu | 自包含、可共享、有市场 | 自定义格式 |
| **仅内置** | Aider, Codex | 简单、可预测 | 扩展性有限 |
| **IDE 集成** | Cursor, Cline | 丰富的编辑器上下文 | 绑定 IDE |

### 多 Agent 模式

大多数 Harness 是单 Agent 的。多 Agent 支持差异很大：

```python
# OpenClaw/Nexu: 一等公民的子 Agent 生成
subagent = spawn(
    task="Research competitor pricing",
    model="gpt-4o",
    tools=["web_search", "web_fetch"],
)
# Result auto-announces when done — no polling needed

# Claude Code: 通过 exec 间接实现多 Agent
result = exec("claude-code --print 'Review this PR'")
# Works but no structured communication

# 其他: 无原生多 Agent
# 变通方案: 多个终端会话，手动协调
```

## 如何选择合适的 Harness

| 如果你需要…… | 考虑 |
|---|---|
| 深度代码编辑 + IDE 集成 | **Cursor** 或 **Cline** |
| 终端编码 Agent | **Claude Code** 或 **Aider** |
| 沙箱化任务执行 | **Codex** |
| 多 Agent 编排 | **OpenClaw** 或 **Nexu** |
| 跨会话持久记忆 | **OpenClaw** 或 **Nexu** |
| 可扩展的工具生态 | **OpenClaw**（Skill + MCP） |
| 最小配置，开箱即用 | **Aider** |

## 表格之外

- **模型支持** — 多数 Harness 与模型无关（OpenClaw、Cline、Aider 支持多种提供商）。Codex 仅限 OpenAI。Claude Code 聚焦 Anthropic。
- **成本** — 因模型选择、上下文大小和任务复杂度而异。不是 Harness 特性，而是使用模式的问题。
- **速度** — 更多取决于模型延迟而非 Harness 架构。流式输出已普遍支持。
- **社区** — 开源项目（Aider、Claude Code、Cline、OpenClaw）都有活跃社区。社区规模不等于质量。

## 常见陷阱

- **跟风选择** — 选适合你工作流的 Harness，而不是 GitHub star 最多的。
- **忽视记忆** — 如果你的任务跨会话，没有持久记忆的 Harness 意味着每次都要重新解释上下文。
- **以为"开源"等于"免费"** — Harness 免费，模型 API 调用不免费。要预估 API 成本。
- **锁定单一 Harness** — 基于文件的配置（AGENTS.md、MEMORY.md）可迁移。闭源的记忆系统则不行。参见 [记忆可迁移性 →](memory-portability.md)。

## 延伸阅读

- [扩展维度 →](scaling-dimensions.md) — 这些 Harness 如何在时间、空间和交互维度上扩展
- [术语表 →](glossary.md) — 本指南中使用的关键术语

---

*下一篇：[术语表 →](glossary.md)*
