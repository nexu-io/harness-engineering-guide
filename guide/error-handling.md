---
author: Nexu
---

# Error Handling

> **Core Insight:** In a traditional program, an unhandled error crashes the process. In an agentic system, the model *is* the error handler — if you surface the error clearly, the model can adapt, retry, or try an alternative approach. Your job is to classify errors, apply the right recovery strategy, and escalate to a human only when automated recovery fails.

## Error Classification

Not all errors are equal. The recovery strategy depends on the error class:

| Class | Description | Recovery |
|-------|-------------|----------|
| **Transient** | Network timeout, rate limit, temporary outage | Retry with backoff |
| **Permanent** | File not found, permission denied, invalid input | Report to model, try alternative |
| **Model** | Malformed tool call, hallucinated function name, invalid JSON | Re-prompt with correction |
| **Resource** | Out of memory, disk full, token budget exceeded | Checkpoint and escalate |

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

## Retry with Exponential Backoff

Transient errors should be retried automatically. The key is exponential backoff with jitter — without it, multiple retries can thundering-herd a recovering service:

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

The math: with `base_delay=2.0`, retries happen at ~2s, ~5s, ~9s. The jitter prevents synchronized retries across multiple agents hitting the same API.

## Graceful Degradation

When a tool fails permanently, the model should try alternatives rather than giving up. The harness facilitates this by returning clear error messages:

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

The critical design decision: **always return errors as tool results, never raise exceptions through the agentic loop**. The model needs to see the error to adapt. A swallowed exception results in silent failure or hallucinated success.

## Human-in-the-Loop Escalation

Some errors require human judgment. The escalation pattern:

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

## Checkpoint/Resume for Long Tasks

Long-running tasks (20+ turns) are vulnerable to mid-task failures. Checkpointing lets the agent resume without losing progress:

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

The atomic write pattern (`write to .tmp` → `rename`) prevents corrupted checkpoints if the process crashes mid-write.

## Common Pitfalls

- **Retrying permanent errors** — Retrying "file not found" 3 times won't make the file appear. Classify first, then decide strategy.
- **Swallowing errors silently** — If a tool returns an empty string on failure, the model thinks it succeeded. Always include the error type and message in the tool result.
- **No backoff jitter** — Exponential backoff without jitter creates synchronized retry storms. Always add randomness.
- **Checkpointing every turn** — Writing a checkpoint after every single tool call adds latency and disk I/O. Every 3–5 turns strikes the right balance between recovery granularity and performance.
- **Escalating too eagerly** — Asking the human for help on every transient error destroys trust. Auto-recover what you can; only escalate when automated recovery is exhausted.

## Further Reading

- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — The definitive guide to retry strategies
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Error recovery patterns in production agent systems
- [Microsoft: Retry Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry) — Cloud design patterns for transient fault handling
