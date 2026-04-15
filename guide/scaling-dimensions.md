# Scaling Dimensions

Not all agents need to scale the same way. A code editor agent needs to see many files simultaneously. A research agent needs to think for minutes on a single question. A customer service agent needs to coordinate with humans and other agents. These are three fundamentally different scaling axes.

Wayne Zhang's framework identifies three dimensions of agent scaling: **Time**, **Space**, and **Interaction**. Understanding which dimension your use case needs determines how you design the harness.

## The Three Dimensions

```
                        Time (Depth)
                        │
                        │  Longer context windows
                        │  Deeper reasoning chains
                        │  Extended planning
                        │
                        │
     Space (Breadth) ───┼─── Interaction (Coordination)
     Multi-file scope       Multi-agent collaboration
     Repo-wide context      Human-in-the-loop
     Cross-system reach     Orchestration patterns
```

Each dimension maps to different harness design decisions, different performance bottlenecks, and different product categories.

## Dimension 1: Time (Depth)

**Exemplar:** Anthropic's Claude (deep thinking, extended context)

Time scaling means giving the agent more *sequential* reasoning capacity. More thinking steps, longer context windows, deeper chains of thought.

### What Time Scaling Looks Like

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

### Harness Design for Time Scaling

| Design Decision | Time-Optimized Choice |
|---|---|
| **Context window** | Maximum (200K+). Load entire files, full history. |
| **Thinking budget** | High. Let the model reason internally before responding. |
| **Tool loop iterations** | Many (50+). Complex tasks need many sequential steps. |
| **Memory strategy** | Dense. Include full conversation history, prior analysis. |
| **Timeout** | Long (minutes). Deep analysis takes time. |

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

**Use cases:** Security auditing, code review, legal analysis, research, debugging complex systems.

## Dimension 2: Space (Breadth)

**Exemplar:** Cursor (multi-file, repo-wide operations)

Space scaling means giving the agent a wider *simultaneous* view. More files at once, more systems in scope, broader context across a project.

### What Space Scaling Looks Like

```python
# Narrow (low space scaling): single file
response = agent.run("Fix the bug in server.py")

# Broad (high space scaling): repo-wide awareness
response = agent.run(
    "Rename the User model to Account across the entire codebase. "
    "Update all imports, tests, migrations, and API endpoints."
)
```

### Harness Design for Space Scaling

| Design Decision | Space-Optimized Choice |
|---|---|
| **Context strategy** | Selective loading. Index everything, load on demand. |
| **File indexing** | Required. The agent needs to *find* relevant files fast. |
| **Tool design** | Grep, tree, search tools. Navigation > reading everything. |
| **Context compression** | Aggressive. Summarize files to fit more in context. |
| **Parallelism** | High. Read multiple files simultaneously. |

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

**Use cases:** Large refactors, codebase migrations, multi-file feature development, cross-service changes.

## Dimension 3: Interaction (Coordination)

**Exemplar:** OpenAI's multi-agent architecture, human-in-the-loop systems

Interaction scaling means giving the agent the ability to collaborate — with other agents, with humans, or with external systems — during task execution.

### What Interaction Scaling Looks Like

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

### Harness Design for Interaction Scaling

| Design Decision | Interaction-Optimized Choice |
|---|---|
| **Architecture** | Multi-agent with message passing. |
| **Session model** | Shared context between agents, isolated execution. |
| **Human touchpoints** | Explicit approval gates, escalation policies. |
| **Communication** | Structured handoffs with clear input/output contracts. |
| **Error recovery** | Delegate to specialist agent or escalate to human. |

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

**Use cases:** Content pipelines, customer service with escalation, code review workflows, research teams.

## Mapping Dimensions to Products

Real products combine all three dimensions but emphasize different ones:

| Product | Time | Space | Interaction | Primary Focus |
|---------|------|-------|-------------|---------------|
| **Claude Code** | ★★★ | ★★ | ★ | Deep reasoning on code |
| **Cursor** | ★★ | ★★★ | ★ | Repo-wide awareness |
| **OpenAI Codex** | ★★ | ★★ | ★★ | Balanced, sandboxed |
| **OpenClaw** | ★★ | ★★ | ★★★ | Multi-agent, skills |
| **Devin** | ★★★ | ★★★ | ★★ | End-to-end autonomy |
| **ChatGPT** | ★★★ | ★ | ★ | General reasoning |

## Choosing Your Scaling Strategy

Ask three questions about your use case:

1. **Does the task require deep thinking?** (Time) → Invest in larger context, longer timeouts, extended thinking.

2. **Does the task span many files or systems?** (Space) → Invest in indexing, search tools, context compression.

3. **Does the task require collaboration?** (Interaction) → Invest in multi-agent orchestration, human touchpoints, message passing.

Most harnesses start by scaling one dimension well, then expand to others. Trying to scale all three simultaneously from day one leads to complexity without clarity.

## Common Pitfalls

- **Scaling the wrong dimension** — A chatbot doesn't need multi-agent orchestration. A code editor doesn't need 5-minute thinking budgets. Match the scaling to the use case.
- **Confusing time with space** — Loading more files isn't time scaling — it's space scaling. Time scaling is about *thinking depth*, not context size.
- **Ignoring the interaction dimension** — Solo agents hit a ceiling. Adding human checkpoints or specialist sub-agents is often the highest-leverage improvement.

## Further Reading

- [Comparison →](comparison.md) — How major harnesses scale across dimensions
- [Harness as a Service →](harness-as-a-service.md) — Infrastructure for scaling dimensions in production
