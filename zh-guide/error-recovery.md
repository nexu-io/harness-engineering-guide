# 错误恢复

Agent 会失败。工具超时、API 返回 500、模型幻觉出无效的函数调用、Sandbox 崩溃。生产级 Harness 不是永不失败的——而是**失败后能优雅恢复**的。

本指南覆盖三层错误恢复：退避重试、优雅降级、以及人工介入升级。

## 错误分类

不是所有错误都一样。第一步是分类：

| 类型 | 示例 | 策略 |
|------|------|------|
| **瞬态** | 网络超时、限流 (429)、API 临时宕机 | 退避重试 |
| **永久** | 无效 API key、文件不存在、权限拒绝 | 快速失败，上报 |
| **模型错误** | 幻觉的工具名、格式错误的参数、无限循环 | 重新提示或降级 |

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

分类正确很重要。对永久错误重试会浪费 Token 和时间。对瞬态错误快速失败会错失唾手可得的机会。

## 退避重试

最简单的恢复模式。用指数退避的重试装饰器包装工具执行：

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

关键细节：
- **Jitter** 防止多个 Agent 同时重试时产生惊群效应。
- **最大延迟上限** 确保不会在重试之间等 10 分钟。
- **永久错误跳过重试** — 重试 403 没有意义。

## 优雅降级

当工具持续失败时，不要让整个 Agent 卡住。**降级**：移除有问题的工具，让模型用剩余的工具继续工作。

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

关键细节：降级时**必须更新发给模型的工具列表**。如果模型在 schema 中仍然看到坏掉的工具，它会继续尝试调用。从定义中移除它，模型自然会绕过这个故障。

举个例子：你的 `web_search` 工具挂了。有了降级机制，Agent 会停止尝试搜索，转而用 `web_fetch` 访问已知 URL，或者直接问用户要信息。Agent 能适应，因为 Harness 先适应了。

## 人工介入升级

有些错误既不能重试也不能降级。模型卡住了、任务有歧义、或者错误需要人工判断。这时候就需要**升级**。

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

升级不是失败——而是 Harness 足够聪明，知道自己已经超出能力范围。

## 完整的错误处理循环

以下是三层机制如何在主 Agent 循环中组合：

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

## 检查点/恢复模式

长时间运行的 Agent 应该对状态做检查点，这样崩溃后可以恢复而不是从头开始：

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

检查点对多步任务尤其重要。如果 Agent 在 20 步任务中已经执行了 15 步然后进程崩溃，从头开始会浪费时间和金钱。检查点让它可以从第 15 步继续。

## 常见陷阱

- **重试太激进** — 没有退避的话，你会更快撞上限流并烧掉 Token。始终使用指数延迟。
- **静默吞掉错误** — 模型需要看到错误消息才能调整策略。把错误作为工具结果传回，而不是传空字符串。
- **没有升级边界** — 没有成本或错误上限的话，困惑的 Agent 会无限循环。始终设置限制。
- **忘记更新工具 schema** — 降级只有在模型看不到坏掉的工具时才有效。每次循环迭代都要更新定义。

## 延伸阅读

- [评估与测试 →](eval-and-testing.md) — 测试你的错误恢复是否真的有效
- [Harness 即服务 →](harness-as-a-service.md) — 多租户部署中的错误恢复
