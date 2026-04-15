---
author: Nexu
---

# 错误处理

> **核心洞察：** 在传统程序中，未处理的错误会让进程崩溃。在 Agentic 系统中，模型*本身就是*错误处理器——只要你清晰地呈现错误，模型就能适应、重试或换一种方式。你的工作是分类错误、应用正确的恢复策略，只在自动恢复失败时才升级给人类。

## 错误分类

不是所有错误都一样。恢复策略取决于错误类别：

| 类别 | 描述 | 恢复方式 |
|-------|-------------|----------|
| **瞬时错误** | 网络超时、限流、临时故障 | 指数退避重试 |
| **永久错误** | 文件不存在、权限拒绝、输入无效 | 报告给模型，尝试替代方案 |
| **模型错误** | 畸形 Tool 调用、幻觉函数名、无效 JSON | 带纠正信息重新 prompt |
| **资源错误** | 内存不足、磁盘满、Token 预算超限 | Checkpoint 并升级 |

```python
from enum import Enum


class ErrorClass(Enum):
    TRANSIENT = "transient"
    PERMANENT = "permanent"
    MODEL = "model"
    RESOURCE = "resource"


def classify_error(error: Exception, context: dict | None = None) -> ErrorClass:
    """Classify an error to determine the recovery strategy."""
    error_type = type(error).__name__
    message = str(error).lower()

    # Transient: network and rate limit errors
    transient_signals = [
        "timeout", "connection", "rate limit", "429", "503",
        "502", "504", "temporary", "retry",
    ]
    if any(signal in message for signal in transient_signals):
        return ErrorClass.TRANSIENT

    # Model errors: bad tool calls, JSON parsing failures
    model_signals = [
        "unknown tool", "invalid json", "missing required",
        "unexpected argument", "malformed",
    ]
    if any(signal in message for signal in model_signals):
        return ErrorClass.MODEL

    # Resource errors: system-level exhaustion
    resource_signals = [
        "out of memory", "disk full", "no space left",
        "token limit", "context length exceeded",
    ]
    if any(signal in message for signal in resource_signals):
        return ErrorClass.RESOURCE

    # Default: permanent (file not found, permission denied, etc.)
    return ErrorClass.PERMANENT
```

## 指数退避重试

瞬时错误应该自动重试。关键是指数退避加抖动——没有抖动的话，多个重试会在恢复中的服务上形成惊群效应：

```python
import time
import random
import functools
from typing import TypeVar, Callable, Any

T = TypeVar("T")


class RetryExhausted(Exception):
    """All retry attempts failed."""
    def __init__(self, last_error: Exception, attempts: int):
        self.last_error = last_error
        self.attempts = attempts
        super().__init__(f"Failed after {attempts} attempts: {last_error}")


def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable: tuple[type[Exception], ...] = (Exception,),
) -> Callable:
    """Decorator: retry with exponential backoff and jitter."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except retryable as e:
                    last_error = e
                    if classify_error(e) != ErrorClass.TRANSIENT:
                        raise  # Don't retry non-transient errors
                    if attempt < max_attempts - 1:
                        delay = min(
                            base_delay * (2 ** attempt) + random.uniform(0, 1),
                            max_delay,
                        )
                        time.sleep(delay)
            raise RetryExhausted(last_error, max_attempts)
        return wrapper
    return decorator


# Usage
@retry(max_attempts=3, base_delay=2.0)
def call_llm(messages: list, tools: list) -> dict:
    """Make an LLM API call with automatic retry on transient failures."""
    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        json={"messages": messages, "tools": tools, "model": "gpt-4o"},
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()
```

算一下：`base_delay=2.0` 时，重试大约在 2s、5s、9s 后发生。抖动防止了多个 Agent 同时命中同一 API 时的同步重试。

## 优雅降级

当一个 Tool 永久失败时，模型应该尝试替代方案而不是放弃。Harness 通过返回清晰的错误信息来辅助这一点：

```python
class ToolExecutor:
    """Execute tools with graceful degradation."""

    def __init__(self):
        self.fallbacks: dict[str, list[str]] = {
            "web_search": ["web_fetch"],
            "read_file": ["shell_exec"],      # fallback: cat via shell
            "git_push": ["git_diff"],          # fallback: show diff instead
        }

    def execute(self, tool_name: str, arguments: dict) -> str:
        """Execute a tool, falling back to alternatives on failure."""
        try:
            result = self._dispatch(tool_name, arguments)
            return result
        except Exception as primary_error:
            error_class = classify_error(primary_error)

            if error_class == ErrorClass.TRANSIENT:
                # Let the retry decorator handle transient errors
                raise

            # Try fallbacks for permanent errors
            fallback_chain = self.fallbacks.get(tool_name, [])
            for fallback_name in fallback_chain:
                try:
                    result = self._dispatch(fallback_name, arguments)
                    return f"[Used fallback: {fallback_name}]\n{result}"
                except Exception:
                    continue

            # All fallbacks failed — return error to the model
            return (
                f"Error in {tool_name}: {primary_error}\n"
                f"Tried fallbacks: {fallback_chain or 'none available'}\n"
                f"All failed. Consider an alternative approach."
            )

    def _dispatch(self, name: str, arguments: dict) -> str:
        """Dispatch to the actual tool handler."""
        handler = tool_registry.get_handler(name)
        if not handler:
            raise ValueError(f"Unknown tool: {name}")
        return str(handler(**arguments))
```

关键设计决策：**始终将错误作为 Tool 结果返回，永远不要在 Agentic Loop 中抛出异常**。模型需要看到错误才能适应。被吞掉的异常会导致静默失败或幻觉出的成功。

## 人在回路中的升级

有些错误需要人类判断。升级模式：

```python
class EscalationLevel(Enum):
    AUTO = "auto"         # Fully automated recovery
    INFORM = "inform"     # Recover automatically, notify human
    CONFIRM = "confirm"   # Ask human before proceeding
    BLOCK = "block"       # Stop and wait for human input


def determine_escalation(
    error: Exception,
    error_class: ErrorClass,
    attempt: int,
    context: dict,
) -> EscalationLevel:
    """Determine how much human involvement is needed."""
    # Resource errors always block — human needs to provision more
    if error_class == ErrorClass.RESOURCE:
        return EscalationLevel.BLOCK

    # Repeated transient failures suggest a real outage
    if error_class == ErrorClass.TRANSIENT and attempt >= 3:
        return EscalationLevel.INFORM

    # Model errors on destructive operations require confirmation
    if error_class == ErrorClass.MODEL and context.get("destructive"):
        return EscalationLevel.CONFIRM

    # Permanent errors on critical paths should inform
    if error_class == ErrorClass.PERMANENT and context.get("critical"):
        return EscalationLevel.INFORM

    return EscalationLevel.AUTO


def escalate(level: EscalationLevel, message: str) -> str | None:
    """Execute the escalation action. Returns human response if blocking."""
    if level == EscalationLevel.AUTO:
        return None

    if level == EscalationLevel.INFORM:
        notify_human(f"⚠️ Agent issue (auto-resolved): {message}")
        return None

    if level == EscalationLevel.CONFIRM:
        return ask_human(f"⚠️ Agent needs confirmation: {message}\nProceed? (yes/no)")

    if level == EscalationLevel.BLOCK:
        return ask_human(f"🛑 Agent blocked: {message}\nPlease resolve and reply.")
```

## 长任务的 Checkpoint/恢复

长时间运行的任务（20 轮以上）容易在中途失败。Checkpoint 让 Agent 可以恢复而不丢失进度：

```python
import json
import os
from datetime import datetime


class Checkpoint:
    """Save and restore agent progress for long-running tasks."""

    def __init__(self, checkpoint_dir: str = "/tmp/agent-checkpoints"):
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(checkpoint_dir, exist_ok=True)

    def save(self, task_id: str, state: dict):
        """Save current progress."""
        checkpoint = {
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "state": state,
        }
        path = os.path.join(self.checkpoint_dir, f"{task_id}.json")
        # Write atomically (write to temp, then rename)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(checkpoint, f, indent=2)
        os.rename(tmp_path, path)

    def load(self, task_id: str) -> dict | None:
        """Load the last checkpoint for a task."""
        path = os.path.join(self.checkpoint_dir, f"{task_id}.json")
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)["state"]

    def clear(self, task_id: str):
        """Remove checkpoint after task completes."""
        path = os.path.join(self.checkpoint_dir, f"{task_id}.json")
        if os.path.exists(path):
            os.unlink(path)


# Usage in the agentic loop
checkpoint = Checkpoint()

def agentic_loop_with_checkpoint(task_id: str, messages: list, tools: list):
    """Agentic loop that can resume from a checkpoint."""
    # Try to resume from checkpoint
    saved_state = checkpoint.load(task_id)
    if saved_state:
        messages = saved_state["messages"]
        turn = saved_state["turn"]
        print(f"Resumed from checkpoint at turn {turn}")
    else:
        turn = 0

    for turn in range(turn, 50):
        try:
            response = call_llm(messages, tools)
            assistant_msg = response["choices"][0]["message"]
            messages.append(assistant_msg)

            if not assistant_msg.get("tool_calls"):
                checkpoint.clear(task_id)
                return assistant_msg["content"]

            for tc in assistant_msg["tool_calls"]:
                result = execute_tool(tc)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

            # Checkpoint every 5 turns
            if turn % 5 == 0:
                checkpoint.save(task_id, {
                    "messages": messages,
                    "turn": turn,
                })

        except RetryExhausted as e:
            # Save progress and escalate
            checkpoint.save(task_id, {"messages": messages, "turn": turn})
            escalate(
                EscalationLevel.BLOCK,
                f"Task {task_id} failed at turn {turn}: {e}",
            )
            break
```

原子写入模式（写入 `.tmp` → `rename`）可以防止进程在写入过程中崩溃导致 Checkpoint 损坏。

## 常见陷阱

- **重试永久错误** —— 重试 3 次"文件不存在"不会让文件出现。先分类，再决定策略。
- **静默吞掉错误** —— 如果 Tool 在失败时返回空字符串，模型会以为成功了。始终在 Tool 结果中包含错误类型和信息。
- **退避没有抖动** —— 没有抖动的指数退避会产生同步重试风暴。始终加入随机性。
- **每轮都做 Checkpoint** —— 每次 Tool 调用后都写 Checkpoint 会增加延迟和磁盘 I/O。每 3–5 轮是恢复粒度和性能之间的合理平衡。
- **升级太积极** —— 每个瞬时错误都找人类帮忙会毁掉信任。能自动恢复的就自动恢复；只在自动恢复耗尽后才升级。

## 延伸阅读

- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — 重试策略的权威指南
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — 生产级 Agent 系统的错误恢复模式
- [Microsoft: Retry Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry) — 瞬时故障处理的云设计模式
