---
author: Nexu
---

# 錯誤處理

> **核心洞察：** 在傳統程式中，未處理的錯誤會讓程序崩潰。在 Agentic 系統中，模型*本身就是*錯誤處理器——只要你清晰地呈現錯誤，模型就能適應、重試或換一種方式。你的工作是分類錯誤、應用正確的恢復策略，只在自動恢復失敗時才升級給人類。

## 錯誤分類

不是所有錯誤都一樣。恢復策略取決於錯誤類別：

| 類別 | 描述 | 恢復方式 |
|-------|-------------|----------|
| **瞬時錯誤** | 網路超時、限流、臨時故障 | 指數退避重試 |
| **永久錯誤** | 檔案不存在、權限拒絕、輸入無效 | 報告給模型，嘗試替代方案 |
| **模型錯誤** | 畸形 Tool 呼叫、幻覺函式名、無效 JSON | 帶糾正資訊重新 prompt |
| **資源錯誤** | 記憶體不足、磁碟滿、Token 預算超限 | Checkpoint 並升級 |

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

## 指數退避重試

瞬時錯誤應該自動重試。關鍵是指數退避加抖動——沒有抖動的話，多個重試會在恢復中的服務上形成驚群效應：

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

算一下：`base_delay=2.0` 時，重試大約在 2s、5s、9s 後發生。抖動防止了多個 Agent 同時命中同一 API 時的同步重試。

## 優雅降級

當一個 Tool 永久失敗時，模型應該嘗試替代方案而不是放棄。Harness 通過返回清晰的錯誤資訊來輔助這一點：

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

關鍵設計決策：**始終將錯誤作為 Tool 結果返回，永遠不要在 Agentic Loop 中丟擲異常**。模型需要看到錯誤才能適應。被吞掉的異常會導致靜默失敗或幻覺出的成功。

## 人在迴路中的升級

有些錯誤需要人類判斷。升級模式：

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

## 長任務的 Checkpoint/恢復

長時間執行的任務（20 輪以上）容易在中途失敗。Checkpoint 讓 Agent 可以恢復而不丟失進度：

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

原子寫入模式（寫入 `.tmp` → `rename`）可以防止程序在寫入過程中崩潰導致 Checkpoint 損壞。

## 常見陷阱

- **重試永久錯誤** —— 重試 3 次"檔案不存在"不會讓檔案出現。先分類，再決定策略。
- **靜默吞掉錯誤** —— 如果 Tool 在失敗時返回空字串，模型會以為成功了。始終在 Tool 結果中包含錯誤型別和資訊。
- **退避沒有抖動** —— 沒有抖動的指數退避會產生同步重試風暴。始終加入隨機性。
- **每輪都做 Checkpoint** —— 每次 Tool 呼叫後都寫 Checkpoint 會增加延遲和磁碟 I/O。每 3–5 輪是恢復粒度和效能之間的合理平衡。
- **升級太積極** —— 每個瞬時錯誤都找人類幫忙會毀掉信任。能自動恢復的就自動恢復；只在自動恢復耗盡後才升級。

## 延伸閱讀

- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — 重試策略的權威指南
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — 生產級 Agent 系統的錯誤恢復模式
- [Microsoft: Retry Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry) — 瞬時故障處理的雲設計模式
