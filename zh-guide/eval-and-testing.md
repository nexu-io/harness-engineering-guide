# 评估与测试

不能衡量的东西就无法改进。Agent Harness 出了名地难测——模型是非确定性的，工具调用有副作用，而"正确"行为往往是主观的。但这不意味着你跳过测试，而是意味着你用不同的方式测试。

本指南覆盖三种测试策略：行为测试、基于 trace 回放的回归测试、以及生产环境的评估指标。

## 为什么传统测试不够

单元测试断言精确输出。Agent 不产生精确输出。同一个 Agent 问同一个问题两次，你会得到不同的措辞、不同的工具调用顺序、甚至不同的工具——但都产生正确的结果。

你**能**测试的是：
- **Agent 调用了正确的工具吗？**（行为）
- **Agent 产生了可接受的结果吗？**（结果）
- **Agent 在变差吗？**（回归）
- **Agent 的成本效率如何？**（经济性）

## 行为测试

行为测试验证：给定特定输入，Agent 表现出预期行为——不是精确输出，而是结构化模式。

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

`MockToolSet` 是关键。它记录每次工具调用但不执行副作用，让你可以对行为模式做断言：

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

## 基于 Trace 回放的回归测试

**Trace** 是 Agent 会话的完整记录：每条消息、每次工具调用、每个工具结果、以及最终输出。Trace 就是你的回归测试套件。

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

用 trace 做回归测试时，重放用户输入并检查 Agent 行为是否退化：

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

## 极简评估框架

一个自包含的评估框架，用来对你的 Harness 做基准测试：

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

## 核心评估指标

在生产环境中跟踪以下指标：

| 指标 | 衡量什么 | 目标 |
|------|----------|------|
| **任务完成率** | 无需升级完成的任务百分比 | > 85% |
| **工具调用准确率** | 成功的工具调用百分比 | > 95% |
| **单任务成本** | 每个任务的平均 USD 花费 | 因场景而异 |
| **延迟 (P50/P95)** | 从输入到最终输出的时间 | < 30s P50 |
| **循环迭代数** | 每个任务的平均工具调用次数 | 越少越高效 |
| **升级率** | 需要人工帮助的任务百分比 | < 10% |
| **回归率** | trace 回放评分低于 3 的百分比 | < 5% |

## Agent 测试金字塔

```
        /  LLM Judge  \        ← 昂贵，全面
       / Trace Replay   \      ← 中等成本，捕获回归
      / Behavioral Tests  \    ← 便宜，快速，捕获结构性 bug
     / Tool Unit Tests      \  ← 最便宜，隔离测试工具
    ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
```

从底层开始。工具单元测试完全不需要 LLM——只测试你的工具实现是否正常工作。行为测试用模型但用 mock 工具（便宜）。Trace 回放是周期性的。LLM judge 评估用于发版门禁。

## 常见陷阱

- **测试精确输出** — Agent 输出是变化的。测试结构和行为，不要测逐字字符串。
- **没有基线 trace** — 没有录制的 trace，就检测不到回归。今天就开始录制。
- **忽略成本指标** — 一个能用但每个任务花 $2 的 Harness，在大多数场景下就是坏的。成本和正确性一起追踪。
- **每次提交都跑评估** — 基于 LLM 的评估又慢又贵。在 PR 和发版时跑，不要每次 push 都跑。

## 延伸阅读

- [错误恢复 →](error-recovery.md) — 测试你的恢复模式是否真的有效
- [Meta-Harness →](meta-harness.md) — 用评估结果来优化自身的 Agent

---

*下一篇：[Harness 即服务 →](harness-as-a-service.md)*
