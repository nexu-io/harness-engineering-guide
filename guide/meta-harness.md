# Meta-Harness

What if an agent could optimize its own harness? Not just execute tasks, but learn from failures, rewrite its own instructions, and improve over time without human intervention. This is the **meta-harness** pattern: agents that debug and upgrade themselves.

## The Core Idea

Every harness has configuration that affects agent behavior: system prompts, tool definitions, AGENTS.md instructions, memory files. Usually, a human tunes these by hand based on observing failures. The meta-harness automates this loop:

```
Run task → Collect traces → Analyze failures → Rewrite config → Repeat
```

The agent becomes its own harness engineer.

## The AutoAgent Pattern

The clearest implementation of this idea comes from the **AutoAgent** paper (2025), which achieved 96.5% on SpreadsheetBench — a benchmark where previous state-of-the-art was around 78%. The system works by having a "meta-agent" observe a "task-agent" and iteratively improve its instructions.

The architecture has two layers:

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

The Task Agent runs normally. The Meta-Agent watches, learns, and rewrites.

## Implementation

Here's a working meta-harness loop:

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

## What Gets Rewritten

The meta-agent can modify several configuration surfaces:

### 1. System Prompt (AGENTS.md)

The most common target. The meta-agent adds, removes, or refines instructions:

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

### 2. Tool Definitions

The meta-agent can add parameter constraints or usage hints:

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

### 3. Memory Files

The meta-agent can update MEMORY.md with lessons learned:

```markdown
## Lessons Learned (auto-generated)
- CSV files in this project use semicolons, not commas
- The API rate limit is 10 requests/minute — add delays
- User prefers bullet points over paragraphs
```

## Safeguards

Self-modifying agents sound dangerous. They are, without guardrails:

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

## Real-World Results

The AutoAgent paper demonstrates the power of this pattern on SpreadsheetBench:

| Approach | Success Rate |
|----------|-------------|
| Direct prompting (GPT-4) | 44.2% |
| ReAct agent | 58.1% |
| Hand-tuned harness | 78.3% |
| **AutoAgent (self-optimizing)** | **96.5%** |

The key insight: the meta-agent discovered domain-specific patterns that human engineers missed. For spreadsheet tasks, it learned to always check cell types before operations, validate formulas incrementally, and break complex operations into atomic steps.

## When to Use Meta-Harness

**Good fit:**
- Repetitive task domains (data processing, testing, code review)
- Large eval suites with clear success criteria
- Teams without dedicated prompt engineers

**Bad fit:**
- One-off creative tasks (no repetition to learn from)
- Safety-critical domains (self-modification adds risk)
- Very small task sets (not enough signal for optimization)

## Common Pitfalls

- **Overfitting to failures** — The meta-agent may add instructions so specific they break general cases. Always re-run the full suite after rewriting, not just the failures.
- **Config drift** — After many iterations, the config becomes bloated. Periodically have the meta-agent consolidate and simplify.
- **No rollback** — If a rewrite makes things worse, you need to undo it. Always keep version history.
- **Unbounded iteration** — Set a maximum iteration count. If the agent can't reach target quality in 5 rounds, the problem is architectural, not configurational.

## Further Reading

- [AutoAgent: Fully Automated and Zero-Code Framework for LLM Agents](https://arxiv.org/abs/2502.05957) — The paper that demonstrated 96.5% on SpreadsheetBench
- [Eval & Testing →](eval-and-testing.md) — Build the eval suite the meta-harness optimizes against
