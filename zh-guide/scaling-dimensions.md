# 三维扩展

不是所有 Agent 都需要以相同的方式扩展。代码编辑器 Agent 需要同时看到很多文件。研究型 Agent 需要在一个问题上思考几分钟。客服 Agent 需要与人类和其他 Agent 协作。这是三个根本不同的扩展维度。

Wayne Zhang 的框架提出了 Agent 扩展的三个维度：**时间**、**空间**和**交互**。理解你的场景需要哪个维度，决定了你如何设计 Harness。

## 三个维度

```
                        Time (深度)
                        │
                        │  更大的 Context Window
                        │  更深的推理链
                        │  更长的规划
                        │
                        │
     Space (广度) ──────┼────── Interaction (协作)
     多文件范围                 多 Agent 协作
     仓库级上下文               人工介入循环
     跨系统触达                 编排模式
```

每个维度对应不同的 Harness 设计决策、不同的性能瓶颈和不同的产品类别。

## 维度 1：时间（深度）

**代表产品：** Anthropic 的 Claude（深度思考，超长上下文）

时间扩展意味着给 Agent 更多的*顺序*推理能力。更多的思考步骤，更大的 Context Window，更深的思维链。

### 时间扩展的样子

```python
# Shallow (low time scaling): single-turn, fast response
response = llm.chat("What's 2+2?")

# Deep (high time scaling): multi-step reasoning with extended thinking
response = llm.chat(
    "Analyze this 200-page codebase for security vulnerabilities. "
    "Consider OWASP Top 10, dependency risks, and auth patterns.",
    thinking={"type": "enabled", "budget_tokens": 32_000},
    max_tokens=16_000,
)
```

### 时间维度的 Harness 设计

| 设计决策 | 时间优化的选择 |
|----------|----------------|
| **Context Window** | 最大化（200K+）。加载完整文件、完整历史。 |
| **思考预算** | 高。让模型在响应前做内部推理。 |
| **Tool Loop 迭代** | 多（50+）。复杂任务需要很多顺序步骤。 |
| **记忆策略** | 密集。包含完整对话历史、之前的分析。 |
| **超时** | 长（分钟级）。深度分析需要时间。 |

```python
class TimeOptimizedHarness:
    """Harness optimized for deep, sequential reasoning."""

    def __init__(self):
        self.max_context = 200_000  # tokens
        self.max_iterations = 100
        self.thinking_budget = 32_000
        self.timeout_seconds = 300  # 5 minutes

    def build_context(self, task: str, memory: str,
                       history: list) -> list:
        messages = [
            {"role": "system", "content": self._system_prompt()},
        ]

        # Load full memory — time-scaled agents benefit from
        # maximum context
        if memory:
            messages.append({
                "role": "system",
                "content": f"## Memory\n{memory}"
            })

        # Include complete history — no summarization
        messages.extend(history)
        messages.append({"role": "user", "content": task})

        return messages

    def _system_prompt(self) -> str:
        return """You are a deep analysis agent. Take your time.
Think through problems step by step. It's better to be thorough
and correct than fast and wrong. Use extended thinking for
complex reasoning before responding."""
```

**适用场景：** 安全审计、代码审查、法律分析、研究、复杂系统调试。

## 维度 2：空间（广度）

**代表产品：** Cursor（多文件，仓库级操作）

空间扩展意味着给 Agent 更宽的*同时*视野。同时看更多文件，覆盖更多系统，在整个项目范围内建立更广的上下文。

### 空间扩展的样子

```python
# Narrow (low space scaling): single file
response = agent.run("Fix the bug in server.py")

# Broad (high space scaling): repo-wide awareness
response = agent.run(
    "Rename the User model to Account across the entire codebase. "
    "Update all imports, tests, migrations, and API endpoints."
)
```

### 空间维度的 Harness 设计

| 设计决策 | 空间优化的选择 |
|----------|----------------|
| **上下文策略** | 选择性加载。索引一切，按需加载。 |
| **文件索引** | 必须。Agent 需要快速*找到*相关文件。 |
| **工具设计** | grep、tree、搜索工具。导航 > 读完所有内容。 |
| **上下文压缩** | 激进。摘要文件以在上下文中塞入更多。 |
| **并行度** | 高。同时读取多个文件。 |

```python
class SpaceOptimizedHarness:
    """Harness optimized for broad, multi-file operations."""

    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        self.index = self._build_index()
        self.max_files_in_context = 20
        self.context_budget = 100_000  # tokens

    def _build_index(self) -> dict:
        """Index workspace for fast file discovery."""
        index = {}
        for path in self.workspace.rglob("*"):
            if path.is_file() and not self._should_ignore(path):
                index[str(path.relative_to(self.workspace))] = {
                    "size": path.stat().st_size,
                    "extension": path.suffix,
                    "first_line": path.open().readline().strip()
                    if path.stat().st_size < 100_000 else "",
                }
        return index

    def get_tools(self) -> list:
        return [
            Tool("tree", "List directory structure"),
            Tool("grep", "Search for patterns across files"),
            Tool("read_file", "Read a specific file"),
            Tool("read_range", "Read specific lines from a file"),
            Tool("edit_file", "Make targeted edits"),
            Tool("batch_edit", "Edit multiple files at once"),
            Tool("find_references", "Find all references to a symbol"),
        ]

    def build_context(self, task: str) -> list:
        messages = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "system", "content": self._workspace_overview()},
        ]
        messages.append({"role": "user", "content": task})
        return messages

    def _workspace_overview(self) -> str:
        """Provide a high-level map without loading all files."""
        file_count = len(self.index)
        extensions = {}
        for info in self.index.values():
            ext = info["extension"] or "(no ext)"
            extensions[ext] = extensions.get(ext, 0) + 1

        overview = f"## Workspace: {file_count} files\n"
        for ext, count in sorted(extensions.items(),
                                  key=lambda x: -x[1])[:10]:
            overview += f"- {ext}: {count} files\n"
        return overview
```

**适用场景：** 大规模重构、代码库迁移、多文件功能开发、跨服务修改。

## 维度 3：交互（协作）

**代表产品：** OpenAI 的多 Agent 架构，人工介入系统

交互扩展意味着给 Agent 在任务执行过程中与其他 Agent、人类或外部系统协作的能力。

### 交互扩展的样子

```python
# Solo (low interaction): agent works alone
result = agent.run("Write the report")

# Collaborative (high interaction): agents coordinate
orchestrator = MultiAgentOrchestrator()

# Spawn specialized sub-agents
researcher = orchestrator.spawn("researcher",
    task="Find the latest data on renewable energy adoption")
writer = orchestrator.spawn("writer",
    task="Write a 2-page report",
    depends_on=[researcher])
reviewer = orchestrator.spawn("reviewer",
    task="Review the report for accuracy and clarity",
    depends_on=[writer])

# Human approves final output
result = await orchestrator.run(
    human_approval_required=True
)
```

### 交互维度的 Harness 设计

| 设计决策 | 交互优化的选择 |
|----------|----------------|
| **架构** | 多 Agent + 消息传递。 |
| **会话模型** | Agent 间共享上下文，执行隔离。 |
| **人工触点** | 显式的审批门、升级策略。 |
| **通信** | 结构化交接，清晰的输入/输出契约。 |
| **错误恢复** | 委派给专家 Agent 或升级给人工。 |

```python
class InteractionOptimizedHarness:
    """Harness optimized for multi-agent collaboration."""

    def __init__(self):
        self.agents = {}
        self.message_bus = MessageBus()
        self.human_queue = asyncio.Queue()

    async def spawn_agent(self, name: str, role: str,
                           tools: list) -> str:
        agent_id = f"{name}-{uuid4().hex[:6]}"
        self.agents[agent_id] = Agent(
            role=role, tools=tools,
            message_bus=self.message_bus,
        )
        return agent_id

    async def run_pipeline(self, task: str,
                            pipeline: list[dict]) -> str:
        """Execute a multi-agent pipeline."""
        context = {"original_task": task}

        for step in pipeline:
            agent_id = step["agent"]
            agent = self.agents[agent_id]

            # Inject previous step results
            step_input = step["prompt_template"].format(**context)
            result = await agent.run(step_input)

            context[step["output_key"]] = result.output

            # Human checkpoint?
            if step.get("human_review"):
                approved = await self._request_human_review(
                    step_name=step["name"],
                    output=result.output,
                )
                if not approved:
                    return "Task cancelled by human reviewer"

        return context.get("final_output", result.output)

    async def _request_human_review(self, step_name: str,
                                     output: str) -> bool:
        print(f"\n🔍 Human review requested for: {step_name}")
        print(f"Output preview: {output[:500]}")
        await self.human_queue.put({
            "step": step_name, "output": output
        })
        # In production, this would be a webhook/UI notification
        response = input("Approve? (y/n): ")
        return response.lower() == "y"
```

**适用场景：** 内容流水线、带升级机制的客服、代码审查流程、研究团队。

## 维度到产品的映射

真实产品组合了三个维度，但各有侧重：

| 产品 | 时间 | 空间 | 交互 | 主要侧重 |
|------|------|------|------|----------|
| **Claude Code** | ★★★ | ★★ | ★ | 代码的深度推理 |
| **Cursor** | ★★ | ★★★ | ★ | 仓库级感知 |
| **OpenAI Codex** | ★★ | ★★ | ★★ | 平衡，沙箱化 |
| **OpenClaw** | ★★ | ★★ | ★★★ | 多 Agent，Skill |
| **Devin** | ★★★ | ★★★ | ★★ | 端到端自主 |
| **ChatGPT** | ★★★ | ★ | ★ | 通用推理 |

## 选择你的扩展策略

对你的场景问三个问题：

1. **任务需要深度思考吗？**（时间）→ 投资更大的上下文、更长的超时、扩展思考。

2. **任务跨越很多文件或系统吗？**（空间）→ 投资索引、搜索工具、上下文压缩。

3. **任务需要协作吗？**（交互）→ 投资多 Agent 编排、人工触点、消息传递。

大多数 Harness 先在一个维度上做好，然后扩展到其他维度。试图从第一天就同时扩展三个维度，只会带来复杂性而没有清晰度。

## 常见陷阱

- **扩展错误的维度** — 聊天机器人不需要多 Agent 编排。代码编辑器不需要 5 分钟的思考预算。让扩展匹配场景。
- **混淆时间和空间** — 加载更多文件不是时间扩展——而是空间扩展。时间扩展关注的是*思考深度*，不是上下文大小。
- **忽略交互维度** — 单打独斗的 Agent 有天花板。添加人工检查点或专家子 Agent 往往是杠杆最高的改进。

## 延伸阅读

- [实现对比 →](comparison.md) — 主流 Harness 在各维度的扩展情况
- [Harness 即服务 →](harness-as-a-service.md) — 在生产中扩展各维度的基础设施
