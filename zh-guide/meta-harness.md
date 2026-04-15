# Meta-Harness

如果 Agent 能优化自己的 Harness 呢？不仅仅是执行任务，而是从失败中学习、重写自己的指令、无需人工干预就能持续改进。这就是 **Meta-Harness** 模式：能调试和升级自身的 Agent。

## 核心思路

每个 Harness 都有影响 Agent 行为的配置：system prompt、工具定义、AGENTS.md 指令、记忆文件。通常由人工根据观察到的失败手动调优。Meta-Harness 把这个循环自动化了：

```
运行任务 → 收集 trace → 分析失败 → 重写配置 → 重复
```

Agent 成了自己的 Harness 工程师。

## AutoAgent 模式

这个思路最清晰的实现来自 **AutoAgent** 论文（2025），在 SpreadsheetBench 上达到了 96.5%——此前最好成绩约 78%。系统的工作方式是让一个"meta-agent"观察"task-agent"并迭代改进其指令。

架构分两层：

```
┌─────────────────────────────────────┐
│          Meta-Agent                  │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ Analyzer │  │ Config Rewriter  │ │
│  └────┬─────┘  └────────┬─────── ┘ │
│       │ traces           │ new config│
│       │                  │          │
│  ┌────▼──────────────────▼────────┐ │
│  │          Task Agent            │ │
│  │  (runs with current config)    │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Task Agent 正常运行。Meta-Agent 观察、学习并重写。

## 实现

一个可运行的 Meta-Harness 循环：

```python
from pathlib import Path
from dataclasses import dataclass

@dataclass
class TaskResult:
    task: str
    success: bool
    trace: list[dict]       # Full conversation trace
    error: str | None
    cost_usd: float
    tool_calls: int

class MetaHarness:
    def __init__(self, config_path: str = "AGENTS.md",
                 meta_model: str = "claude-sonnet-4-20250514",
                 task_model: str = "gpt-4o"):
        self.config_path = Path(config_path)
        self.meta_model = meta_model
        self.task_model = task_model
        self.history: list[TaskResult] = []

    def run_optimization_loop(self, tasks: list[str],
                               max_iterations: int = 5):
        """Run tasks, analyze failures, rewrite config, repeat."""
        for iteration in range(max_iterations):
            print(f"\n{'='*50}")
            print(f"Iteration {iteration + 1}/{max_iterations}")
            print(f"{'='*50}")

            # Step 1: Run all tasks with current config
            results = self._run_tasks(tasks)
            self.history.extend(results)

            # Step 2: Calculate metrics
            success_rate = sum(
                1 for r in results if r.success
            ) / len(results)
            avg_cost = sum(r.cost_usd for r in results) / len(results)

            print(f"Success rate: {success_rate:.0%}")
            print(f"Avg cost: ${avg_cost:.4f}")

            # Step 3: If good enough, stop
            if success_rate >= 0.95:
                print("✅ Target success rate achieved!")
                break

            # Step 4: Analyze failures and rewrite config
            failures = [r for r in results if not r.success]
            new_config = self._analyze_and_rewrite(failures)
            self.config_path.write_text(new_config)
            print(f"📝 Config rewritten ({len(failures)} failures analyzed)")

    def _run_tasks(self, tasks: list[str]) -> list[TaskResult]:
        """Run each task with the current config."""
        config = self.config_path.read_text()
        agent = Agent(
            system_prompt=config,
            model=self.task_model,
            tools=load_tools(),
        )
        results = []
        for task in tasks:
            try:
                result = agent.run(task)
                results.append(TaskResult(
                    task=task, success=result.completed,
                    trace=result.trace, error=None,
                    cost_usd=result.cost, tool_calls=len(result.trace),
                ))
            except Exception as e:
                results.append(TaskResult(
                    task=task, success=False, trace=[],
                    error=str(e), cost_usd=0, tool_calls=0,
                ))
        return results

    def _analyze_and_rewrite(self,
                              failures: list[TaskResult]) -> str:
        """Use the meta-agent to analyze failures and rewrite config."""
        current_config = self.config_path.read_text()

        failure_report = self._build_failure_report(failures)

        prompt = f"""You are a meta-agent that optimizes agent configurations.

## Current Config (AGENTS.md)
{current_config}

## Failure Report
{failure_report}

## Your Task
Analyze why these tasks failed and rewrite the AGENTS.md to fix the issues.

Rules:
1. Keep changes minimal and targeted — don't rewrite everything
2. Add specific instructions that address observed failure patterns
3. If a tool was misused, add usage examples
4. If the agent looped, add loop detection instructions
5. Preserve everything that's working well

Return the complete new AGENTS.md content."""

        response = llm.chat(
            model=self.meta_model,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.text

    def _build_failure_report(self,
                               failures: list[TaskResult]) -> str:
        """Build a structured failure report for the meta-agent."""
        report = []
        for f in failures:
            report.append(f"### Task: {f.task}")
            report.append(f"Error: {f.error or 'Task did not complete'}")
            report.append(f"Tool calls: {f.tool_calls}")

            # Include last few trace entries for context
            if f.trace:
                report.append("Last 3 trace entries:")
                for entry in f.trace[-3:]:
                    report.append(
                        f"  - [{entry['role']}] {entry['content'][:200]}"
                    )
            report.append("")
        return "\n".join(report)
```

## 什么会被重写

Meta-Agent 可以修改多个配置面：

### 1. System Prompt (AGENTS.md)

最常见的目标。Meta-Agent 增加、删除或细化指令：

```markdown
# Before (causes loops on file editing)
## File Editing
Edit files as needed to complete tasks.

# After (meta-agent adds specificity)
## File Editing
When editing files:
1. Always read the file first with read_file
2. Use edit_file with old_text/new_text for targeted changes
3. Never overwrite entire files unless creating new ones
4. If edit_file fails, re-read the file — it may have changed
5. Maximum 3 edit attempts per file before asking for help
```

### 2. 工具定义

Meta-Agent 可以添加参数约束或使用提示：

```python
# Before
{"name": "exec", "description": "Run a shell command"}

# After (meta-agent adds guardrails)
{
    "name": "exec",
    "description": "Run a shell command. IMPORTANT: Always use "
                   "absolute paths. Never run 'rm -rf'. Prefer "
                   "'cat' over 'less' (no TTY available).",
    "parameters": {
        "command": {
            "type": "string",
            "description": "Shell command. Must not contain 'rm -rf' "
                          "or 'sudo'."
        }
    }
}
```

### 3. 记忆文件

Meta-Agent 可以用学到的经验更新 MEMORY.md：

```markdown
## Lessons Learned (auto-generated)
- CSV files in this project use semicolons, not commas
- The API rate limit is 10 requests/minute — add delays
- User prefers bullet points over paragraphs
```

## 安全防护

自我修改的 Agent 听起来很危险。没有防护栏的话确实如此：

```python
class SafeMetaHarness(MetaHarness):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.config_history = []  # Track all versions
        self.max_config_size = 10_000  # chars
        self.forbidden_patterns = [
            "ignore previous instructions",
            "you are now",
            "disregard all",
        ]

    def _analyze_and_rewrite(self, failures):
        new_config = super()._analyze_and_rewrite(failures)

        # Safeguard 1: Size limit
        if len(new_config) > self.max_config_size:
            raise ConfigTooLarge(
                f"New config is {len(new_config)} chars "
                f"(max {self.max_config_size})"
            )

        # Safeguard 2: Forbidden patterns
        for pattern in self.forbidden_patterns:
            if pattern.lower() in new_config.lower():
                raise UnsafeConfig(
                    f"Config contains forbidden pattern: '{pattern}'"
                )

        # Safeguard 3: Diff review
        old_config = self.config_path.read_text()
        diff = generate_diff(old_config, new_config)
        if count_changed_lines(diff) > 50:
            raise ConfigTooManyChanges(
                "Config diff exceeds 50 lines. "
                "Changes should be incremental."
            )

        # Safeguard 4: Version history (rollback support)
        self.config_history.append(old_config)

        return new_config

    def rollback(self):
        """Restore the previous config version."""
        if self.config_history:
            previous = self.config_history.pop()
            self.config_path.write_text(previous)
            print("⏪ Rolled back to previous config")
```

## 实际效果

AutoAgent 论文在 SpreadsheetBench 上展示了这个模式的威力：

| 方法 | 成功率 |
|------|--------|
| 直接提示 (GPT-4) | 44.2% |
| ReAct agent | 58.1% |
| 手动调优的 Harness | 78.3% |
| **AutoAgent（自优化）** | **96.5%** |

关键发现：Meta-Agent 发现了人类工程师忽略的领域特定模式。对于电子表格任务，它学会了在操作前始终检查单元格类型、增量验证公式、以及将复杂操作拆解为原子步骤。

## 适用场景

**适合：**
- 重复性任务领域（数据处理、测试、代码审查）
- 有明确成功标准的大型评估套件
- 没有专职 prompt 工程师的团队

**不适合：**
- 一次性的创意任务（没有重复可供学习）
- 安全关键领域（自我修改增加风险）
- 很小的任务集（信号不够用于优化）

## 常见陷阱

- **对失败过拟合** — Meta-Agent 可能添加过于具体的指令，导致通用场景出问题。重写后始终重跑完整套件，而不仅仅是失败的部分。
- **配置漂移** — 经过多次迭代，配置会变得臃肿。定期让 Meta-Agent 合并和精简。
- **没有回滚** — 如果重写让情况变糟，你需要能撤回。始终保留版本历史。
- **无限迭代** — 设置最大迭代次数。如果 Agent 在 5 轮内达不到目标质量，问题在于架构而非配置。

## 延伸阅读

- [AutoAgent: Fully Automated and Zero-Code Framework for LLM Agents](https://arxiv.org/abs/2502.05957) — 在 SpreadsheetBench 上达到 96.5% 的论文
- [评估与测试 →](eval-and-testing.md) — 构建 Meta-Harness 用于优化的评估套件

---

*下一篇：[记忆可移植性 →](memory-portability.md)*
