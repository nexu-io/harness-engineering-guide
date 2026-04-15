# Eval & Testing

You can't improve what you can't measure. Agent harnesses are notoriously hard to test — the model is non-deterministic, tool calls have side effects, and "correct" behavior is often subjective. But that doesn't mean you skip testing. It means you test differently.

This guide covers three testing strategies: behavioral tests, regression tests via trace replay, and eval metrics for production monitoring.

## Why Traditional Testing Falls Short

Unit tests assert exact outputs. Agents don't produce exact outputs. Ask the same agent the same question twice and you'll get different wording, different tool call order, maybe different tools entirely — all producing correct results.

What you *can* test:
- **Did the agent call the right tools?** (behavioral)
- **Did the agent produce an acceptable result?** (outcome)
- **Is the agent getting worse over time?** (regression)
- **Is the agent cost-efficient?** (economic)

## Behavioral Testing

Behavioral tests verify that given a specific input, the agent exhibits expected behavior — not exact output, but structural patterns.

```python
import pytest
from harness import Agent, MockToolSet

class TestFileEditBehavior:
    """Test that the agent calls the right tools for file editing tasks."""

    def setup_method(self):
        self.tools = MockToolSet()
        self.agent = Agent(tools=self.tools, model="gpt-4o")

    def test_edit_file_reads_first(self):
        """Agent should read a file before editing it."""
        self.agent.run("Fix the typo in README.md")

        calls = self.tools.get_call_history()
        tool_names = [c.name for c in calls]

        # Must read before writing
        assert "read_file" in tool_names, "Agent should read the file"
        read_idx = tool_names.index("read_file")

        assert "edit_file" in tool_names, "Agent should edit the file"
        edit_idx = tool_names.index("edit_file")

        assert read_idx < edit_idx, "Read must come before edit"

    def test_edit_preserves_content(self):
        """Agent should not overwrite the entire file for a small fix."""
        self.tools.set_file_content("README.md", "# Hello Wrold\nMore text...")
        self.agent.run("Fix the typo in README.md")

        calls = self.tools.get_calls_by_name("edit_file")
        assert len(calls) > 0

        # Should use surgical edit, not full rewrite
        edit_call = calls[0]
        assert "old_text" in edit_call.arguments or \
               "old_string" in edit_call.arguments, \
               "Should use find-and-replace, not full overwrite"
```

The `MockToolSet` is key. It records every tool call without executing side effects, letting you assert on behavior patterns:

```python
class MockToolSet:
    def __init__(self):
        self._calls = []
        self._responses = {}

    def execute(self, name: str, arguments: dict) -> str:
        self._calls.append(ToolCall(name=name, arguments=arguments))
        return self._responses.get(name, '{"status": "ok"}')

    def get_call_history(self) -> list[ToolCall]:
        return list(self._calls)

    def get_calls_by_name(self, name: str) -> list[ToolCall]:
        return [c for c in self._calls if c.name == name]

    def set_response(self, tool_name: str, response: str):
        self._responses[tool_name] = response

    def set_file_content(self, path: str, content: str):
        self._responses["read_file"] = content
```

## Regression Testing with Trace Replay

A **trace** is a complete recording of an agent session: every message, tool call, tool result, and final output. Traces are your regression test suite.

```python
import json
from dataclasses import dataclass, asdict
from pathlib import Path

@dataclass
class TraceEntry:
    role: str           # "user", "assistant", "tool"
    content: str
    tool_name: str = None
    tool_args: dict = None
    timestamp: float = None

@dataclass
class Trace:
    task: str
    entries: list[TraceEntry]
    final_output: str
    metrics: dict       # cost, duration, tool_calls, etc.

class TraceRecorder:
    """Record agent sessions for replay and regression testing."""

    def __init__(self, output_dir: str = "./traces"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.entries = []

    def record(self, entry: TraceEntry):
        self.entries.append(entry)

    def save(self, task: str, final_output: str, metrics: dict):
        trace = Trace(
            task=task,
            entries=self.entries,
            final_output=final_output,
            metrics=metrics
        )
        path = self.output_dir / f"trace_{int(time.time())}.json"
        path.write_text(json.dumps(asdict(trace), indent=2))
        return path
```

To use traces for regression testing, you replay the user input and check that the agent's behavior hasn't degraded:

```python
class TraceRegression:
    """Replay traces and compare against baselines."""

    def __init__(self, agent: Agent, judge_model: str = "gpt-4o"):
        self.agent = agent
        self.judge = judge_model

    def replay(self, trace_path: str) -> dict:
        trace = json.loads(Path(trace_path).read_text())
        task = trace["task"]

        # Re-run the task
        result = self.agent.run(task)

        # Compare with LLM judge
        score = self._judge_output(
            task=task,
            baseline=trace["final_output"],
            candidate=result.output
        )

        return {
            "task": task,
            "baseline_cost": trace["metrics"]["cost_usd"],
            "new_cost": result.metrics["cost_usd"],
            "baseline_tools": trace["metrics"]["tool_call_count"],
            "new_tools": result.metrics["tool_call_count"],
            "quality_score": score,  # 1-5 from LLM judge
            "regression": score < 3,
        }

    def _judge_output(self, task: str, baseline: str,
                      candidate: str) -> int:
        prompt = f"""Compare two agent outputs for the same task.
Task: {task}

Baseline output:
{baseline}

New output:
{candidate}

Rate the new output 1-5:
5 = clearly better
4 = slightly better
3 = equivalent
2 = slightly worse
1 = clearly worse

Return just the number."""
        response = llm.chat(model=self.judge, prompt=prompt)
        return int(response.strip())
```

## A Minimal Eval Framework

Here's a self-contained eval framework you can use to benchmark your harness:

```python
import time
import statistics
from dataclasses import dataclass

@dataclass
class EvalCase:
    task: str
    expected_tools: list[str] = None      # Tools that should be called
    forbidden_tools: list[str] = None     # Tools that should NOT be called
    expected_output_contains: str = None  # Substring check
    max_cost_usd: float = None
    max_tool_calls: int = None

@dataclass
class EvalResult:
    case: EvalCase
    passed: bool
    output: str
    tool_calls: list[str]
    cost_usd: float
    duration_s: float
    failure_reason: str = None

class HarnessEval:
    def __init__(self, agent: Agent):
        self.agent = agent

    def run_suite(self, cases: list[EvalCase]) -> dict:
        results = [self._run_case(case) for case in cases]

        return {
            "total": len(results),
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "pass_rate": sum(1 for r in results if r.passed) / len(results),
            "avg_cost": statistics.mean(r.cost_usd for r in results),
            "avg_duration": statistics.mean(r.duration_s for r in results),
            "avg_tool_calls": statistics.mean(
                len(r.tool_calls) for r in results
            ),
            "results": results,
        }

    def _run_case(self, case: EvalCase) -> EvalResult:
        start = time.time()
        result = self.agent.run(case.task)
        duration = time.time() - start

        tools_used = [c.name for c in result.tool_calls]
        passed = True
        reason = None

        # Check expected tools
        if case.expected_tools:
            missing = set(case.expected_tools) - set(tools_used)
            if missing:
                passed = False
                reason = f"Missing tools: {missing}"

        # Check forbidden tools
        if case.forbidden_tools and passed:
            forbidden = set(case.forbidden_tools) & set(tools_used)
            if forbidden:
                passed = False
                reason = f"Used forbidden tools: {forbidden}"

        # Check output content
        if case.expected_output_contains and passed:
            if case.expected_output_contains not in result.output:
                passed = False
                reason = f"Output missing: '{case.expected_output_contains}'"

        # Check cost
        if case.max_cost_usd and passed:
            if result.cost_usd > case.max_cost_usd:
                passed = False
                reason = f"Cost ${result.cost_usd:.3f} > ${case.max_cost_usd}"

        return EvalResult(
            case=case, passed=passed, output=result.output,
            tool_calls=tools_used, cost_usd=result.cost_usd,
            duration_s=duration, failure_reason=reason,
        )

# Example eval suite
eval_cases = [
    EvalCase(
        task="What's the weather in Tokyo?",
        expected_tools=["web_search"],
        max_cost_usd=0.01,
    ),
    EvalCase(
        task="Read README.md and summarize it",
        expected_tools=["read_file"],
        forbidden_tools=["write_file", "edit_file"],
    ),
    EvalCase(
        task="Create a Python hello world script",
        expected_tools=["write_file"],
        expected_output_contains="hello",
    ),
]

# Run
evaluator = HarnessEval(agent)
report = evaluator.run_suite(eval_cases)
print(f"Pass rate: {report['pass_rate']:.0%}")
print(f"Avg cost: ${report['avg_cost']:.4f}")
print(f"Avg duration: {report['avg_duration']:.1f}s")
```

## Key Eval Metrics

Track these metrics in production:

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Task completion rate** | % of tasks completed without escalation | > 85% |
| **Tool call accuracy** | % of tool calls that succeed | > 95% |
| **Cost per task** | Average USD spent per task | Varies by use case |
| **Latency (P50/P95)** | Time from input to final output | < 30s P50 |
| **Loop iterations** | Average tool calls per task | Lower is more efficient |
| **Escalation rate** | % of tasks requiring human help | < 10% |
| **Regression rate** | % of trace replays scoring < 3 | < 5% |

## The Testing Pyramid for Agents

```
        /  LLM Judge  \        ← Expensive, comprehensive
       / Trace Replay   \      ← Medium cost, catches regressions
      / Behavioral Tests  \    ← Cheap, fast, catches structural bugs
     / Tool Unit Tests      \  ← Cheapest, test tools in isolation
    ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
```

Start from the bottom. Tool unit tests don't need an LLM at all — just test that your tool implementations work. Behavioral tests use the model but with mocked tools (cheap). Trace replay is periodic. LLM-judge evals are for release gates.

## Common Pitfalls

- **Testing exact outputs** — Agent outputs vary. Test structure and behavior, not verbatim strings.
- **No baseline traces** — Without recorded traces, you can't detect regressions. Start recording today.
- **Ignoring cost metrics** — A harness that works but costs $2 per task is broken for most use cases. Track cost alongside correctness.
- **Running evals on every commit** — LLM-based evals are slow and expensive. Run them on PRs and releases, not every push.

## Further Reading

- [Error Recovery →](error-recovery.md) — Test that your recovery patterns actually work
- [Meta-Harness →](meta-harness.md) — Agents that use eval results to optimize themselves
