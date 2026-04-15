# Error Recovery

Agents fail. Tools time out, APIs return 500s, models hallucinate invalid function calls, sandboxes crash. A production harness isn't one that never fails — it's one that **recovers gracefully** when it does.

This guide covers three layers of error recovery: retry with backoff, graceful degradation, and human-in-the-loop escalation.

## Error Classification

Not all errors are equal. The first step is classifying them:

| Type | Examples | Strategy |
|------|----------|----------|
| **Transient** | Network timeout, rate limit (429), temporary API outage | Retry with backoff |
| **Permanent** | Invalid API key, file not found, permission denied | Fail fast, report |
| **Model error** | Hallucinated tool name, malformed arguments, infinite loop | Re-prompt or degrade |

```python
class ErrorType:
    TRANSIENT = "transient"
    PERMANENT = "permanent"
    MODEL = "model"

def classify_error(error: Exception) -> str:
    if isinstance(error, (TimeoutError, ConnectionError)):
        return ErrorType.TRANSIENT
    if isinstance(error, RateLimitError):
        return ErrorType.TRANSIENT
    if isinstance(error, (PermissionError, AuthenticationError)):
        return ErrorType.PERMANENT
    if isinstance(error, (ToolNotFoundError, InvalidArgumentsError)):
        return ErrorType.MODEL
    return ErrorType.TRANSIENT  # Default: assume transient, retry
```

Getting classification right matters. Retrying a permanent error wastes tokens and time. Failing fast on a transient error misses easy wins.

## Retry with Backoff

The simplest recovery pattern. Wrap tool execution in a retry decorator with exponential backoff:

```python
import time
import random
from functools import wraps

def retry_with_backoff(max_retries=3, base_delay=1.0, max_delay=60.0):
    """Retry decorator with exponential backoff and jitter."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    error_type = classify_error(e)

                    if error_type == ErrorType.PERMANENT:
                        raise  # Don't retry permanent errors

                    if attempt == max_retries:
                        raise  # Exhausted retries

                    # Exponential backoff with jitter
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.1)
                    time.sleep(delay + jitter)

                    print(f"Retry {attempt + 1}/{max_retries} "
                          f"after {delay:.1f}s: {e}")
            return None
        return wrapper
    return decorator

@retry_with_backoff(max_retries=3, base_delay=2.0)
def execute_tool(tool_name: str, arguments: dict) -> str:
    """Execute a tool call with automatic retry."""
    tool = tool_registry.get(tool_name)
    if not tool:
        raise ToolNotFoundError(f"Unknown tool: {tool_name}")
    return tool.run(**arguments)
```

Key details:
- **Jitter** prevents thundering herd when multiple agents retry simultaneously.
- **Max delay cap** ensures you don't wait 10 minutes between retries.
- **Permanent errors skip retry** — no point retrying a 403.

## Graceful Degradation

When a tool keeps failing, don't let the whole agent stall. **Degrade**: remove the broken tool and let the model work with what's left.

```python
class DegradableToolSet:
    def __init__(self, tools: list[Tool]):
        self.all_tools = {t.name: t for t in tools}
        self.active_tools = dict(self.all_tools)
        self.failure_counts = {t.name: 0 for t in tools}
        self.max_failures = 3

    def execute(self, tool_name: str, arguments: dict) -> str:
        if tool_name not in self.active_tools:
            return f"Tool '{tool_name}' is currently unavailable."

        try:
            result = self.active_tools[tool_name].run(**arguments)
            self.failure_counts[tool_name] = 0  # Reset on success
            return result
        except Exception as e:
            self.failure_counts[tool_name] += 1

            if self.failure_counts[tool_name] >= self.max_failures:
                self._degrade(tool_name, str(e))

            raise

    def _degrade(self, tool_name: str, reason: str):
        """Remove a tool from the active set."""
        del self.active_tools[tool_name]
        print(f"⚠️ Degraded: '{tool_name}' disabled after "
              f"{self.max_failures} failures. Reason: {reason}")

    def get_active_tool_definitions(self) -> list[dict]:
        """Return tool schemas for only active tools."""
        return [t.schema() for t in self.active_tools.values()]
```

The critical detail: when you degrade, **update the tool list you send to the model**. If the model still sees a broken tool in its schema, it will keep trying to call it. Remove it from the definitions, and the model naturally routes around the failure.

Example: your `web_search` tool is down. With degradation, the agent stops trying to search and starts using `web_fetch` with known URLs, or asks the user for the information directly. The agent adapts because the harness adapted.

## Human-in-the-Loop Escalation

Some errors can't be retried or degraded away. The model is stuck, the task is ambiguous, or the error requires human judgment. That's when you **escalate**.

```python
class EscalationPolicy:
    def __init__(self, max_consecutive_errors=5, max_total_cost=1.0):
        self.consecutive_errors = 0
        self.total_cost_usd = 0.0
        self.max_consecutive = max_consecutive_errors
        self.max_cost = max_total_cost

    def record_error(self, error: Exception):
        self.consecutive_errors += 1

    def record_success(self):
        self.consecutive_errors = 0

    def record_cost(self, cost_usd: float):
        self.total_cost_usd += cost_usd

    def should_escalate(self) -> tuple[bool, str]:
        if self.consecutive_errors >= self.max_consecutive:
            return True, (f"Agent hit {self.consecutive_errors} "
                          f"consecutive errors")
        if self.total_cost_usd >= self.max_cost:
            return True, (f"Task cost ${self.total_cost_usd:.2f} "
                          f"exceeds ${self.max_cost:.2f} budget")
        return False, ""
```

Escalation isn't failure — it's the harness being smart enough to know when it's out of its depth.

## The Full Error-Handling Loop

Here's how all three layers combine in the main agent loop:

```python
async def agent_loop(user_input: str, tools: DegradableToolSet,
                     policy: EscalationPolicy, checkpoint: Checkpoint):
    messages = build_context(user_input)
    checkpoint.save(messages, tools)  # Save initial state

    while True:
        response = await llm.chat(
            messages,
            tools=tools.get_active_tool_definitions()
        )
        policy.record_cost(response.usage.cost)

        # Check escalation
        should_escalate, reason = policy.should_escalate()
        if should_escalate:
            return await escalate_to_human(reason, messages, checkpoint)

        if not response.tool_calls:
            return response.text

        for call in response.tool_calls:
            try:
                result = tools.execute(call.name, call.arguments)
                messages.append(tool_result(call, result))
                policy.record_success()
            except Exception as e:
                policy.record_error(e)
                error_msg = f"Tool error: {e}"
                messages.append(tool_result(call, error_msg))

        # Checkpoint after each tool round
        checkpoint.save(messages, tools)
```

## Checkpoint / Resume Pattern

Long-running agents should checkpoint their state so they can resume after a crash instead of starting over:

```python
import json
from pathlib import Path

class Checkpoint:
    def __init__(self, session_id: str, checkpoint_dir: str = "/tmp/checkpoints"):
        self.path = Path(checkpoint_dir) / f"{session_id}.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def save(self, messages: list, tools: DegradableToolSet):
        state = {
            "messages": messages,
            "active_tools": list(tools.active_tools.keys()),
            "failure_counts": tools.failure_counts,
        }
        self.path.write_text(json.dumps(state, default=str))

    def load(self) -> dict | None:
        if self.path.exists():
            return json.loads(self.path.read_text())
        return None

    def clear(self):
        self.path.unlink(missing_ok=True)

# Usage: resume from crash
checkpoint = Checkpoint(session_id="task-42")
saved = checkpoint.load()
if saved:
    print(f"Resuming from checkpoint: {len(saved['messages'])} messages")
    messages = saved["messages"]
else:
    messages = build_context(user_input)
```

Checkpointing is especially important for multi-step tasks. If an agent is 15 tool calls into a 20-step task and the process crashes, restarting from zero wastes time and money. A checkpoint lets it pick up from step 15.

## Common Pitfalls

- **Retrying too aggressively** — Without backoff, you'll hit rate limits harder and burn tokens. Always use exponential delays.
- **Swallowing errors silently** — The model needs to see error messages to adjust its approach. Pass errors back as tool results, not empty strings.
- **No escalation boundary** — Without a cost or error ceiling, a confused agent can spin forever. Always set limits.
- **Forgetting to update tool schemas** — Degradation only works if the model stops seeing the broken tool. Update definitions on every loop iteration.

## Further Reading

- [Eval & Testing →](eval-and-testing.md) — Test that your error recovery actually works
- [Harness as a Service →](harness-as-a-service.md) — Error recovery in multi-tenant deployments

---

*Next: [Eval & Testing →](eval-and-testing.md)*
