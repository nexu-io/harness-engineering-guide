---
author: Nexu
---

# Context 工程

> **核心洞察：** 模型不知道你没告诉它的事。Context 工程是一门决定什么进入 Context Window、以什么顺序、空间不够时砍掉什么的学科。这是 Harness 工程中杠杆最高的工作——比选模型、调 Prompt、设计 Tool 都重要。

## 问题

128K Token 的 Context Window 听起来很大，直到你开始往里塞东西。一个大文件可以吃掉 10K Token，二十个 Tool Schema 吃掉 3K，对话历史每轮线性增长。一个复杂编码任务跑十几轮后，你已经在做艰难的取舍了。

Context 工程就是这些取舍的艺术。它有三大支柱：**组装**（放什么进去）、**压缩**（缩减什么）和**预算**（如何分配容量）。

## Context 组装优先级系统

不是所有 Context 都同等重要。优先级系统确保空间紧张时最关键的信息能存活：

| 优先级 | 类别 | 典型 Token 数 | 说明 |
|----------|----------|---------------|-------|
| 0（最高） | System Prompt | 300–800 | 身份、行为规则、安全约束 |
| 1 | 活跃 Tool Schema | 1,000–3,000 | 只加载已激活的 Skill，不是全部 Tool |
| 2 | 任务指令 | 200–1,000 | 当前用户请求 + 任何固定目标 |
| 3 | Memory 摘要 | 500–2,000 | 压缩后的 MEMORY.md + 当天日志 |
| 4 | 注入文件 | 2,000–20,000 | AGENTS.md、SKILL.md、相关源文件 |
| 5 | 近期对话 | 5,000–50,000 | 最近 N 轮消息 + Tool 结果 |
| 6（最低） | 更早的对话 | 剩余空间 | 更早的轮次，最先被压缩或丢弃 |

组装器从上到下遍历这个列表，填充内容直到预算耗尽。低优先级的内容会被截断或完全排除。

```python
import tiktoken

encoder = tiktoken.encoding_for_model("gpt-4o")

def estimate_tokens(text: str) -> int:
    """Fast token estimation using tiktoken."""
    return len(encoder.encode(text))


class ContextAssembler:
    """Assemble context with priority-based token budgeting."""

    def __init__(self, max_tokens: int = 128_000, reserve: int = 4_096):
        self.max_tokens = max_tokens
        self.reserve = reserve  # Leave room for the model's response
        self.budget = max_tokens - reserve
        self.sections: list[tuple[int, str, str]] = []

    def add(self, priority: int, name: str, content: str):
        """Add a section. Lower priority number = higher importance."""
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        """Pack sections into messages within the token budget."""
        self.sections.sort(key=lambda s: s[0])
        messages = []
        used = 0

        for priority, name, content in self.sections:
            tokens = estimate_tokens(content)
            if used + tokens <= self.budget:
                messages.append({
                    "role": "system",
                    "content": f"[{name}]\n{content}",
                })
                used += tokens
            elif priority <= 2:
                # Critical sections get truncated rather than dropped
                remaining = self.budget - used
                truncated = self._truncate_to_tokens(content, remaining)
                if truncated:
                    messages.append({
                        "role": "system",
                        "content": f"[{name} (truncated)]\n{truncated}",
                    })
                    used += estimate_tokens(truncated)
            # Priority > 2: silently dropped when over budget

        return messages

    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within a token limit."""
        tokens = encoder.encode(text)
        if len(tokens) <= max_tokens:
            return text
        return encoder.decode(tokens[:max_tokens]) + "\n[...truncated]"
```

`reserve` 参数容易被忽视但至关重要——你需要给模型回复留出空间。如果把 Context 塞到 100%，模型就没地方回复了。

## Context 压缩：三道防线

随着 Session 推进，原始对话历史无限增长。三种技术可以防止它吞噬整个 Context Window：

### 第一道：自动衰减

较早的消息自然会失去相关性。简单的衰减策略丢弃固定窗口外的消息，只保留最近 N 轮：

```python
def apply_decay(messages: list[dict], max_turns: int = 20) -> list[dict]:
    """Keep the system prompt and the last max_turns exchanges."""
    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]
    # Each "turn" is roughly a user + assistant + tool cycle
    if len(conversation) > max_turns * 3:
        conversation = conversation[-(max_turns * 3):]
    return system + conversation
```

### 第二道：阈值压缩

当总 Token 数超过阈值（如预算的 70%）时，将较早的对话轮压缩成摘要，同时保留最近几轮的原文：

```python
def threshold_compress(
    messages: list[dict],
    budget: int,
    threshold: float = 0.7,
    keep_recent: int = 10,
) -> list[dict]:
    """Compress older messages when token usage exceeds threshold."""
    total = sum(estimate_tokens(m["content"]) for m in messages)
    if total < budget * threshold:
        return messages  # Under threshold, no compression needed

    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    old = conversation[:-keep_recent]
    recent = conversation[-keep_recent:]

    summary = summarize_with_llm(old)  # Use a fast, cheap model
    compressed = system + [{
        "role": "system",
        "content": f"[Conversation summary]\n{summary}",
    }] + recent

    return compressed
```

### 第三道：主动摘要

对于超长任务，定期提取关键事实和决策到一个滚动摘要文档中。这不是自动的——Harness 需要显式地让模型生成 Checkpoint：

```python
SUMMARIZE_PROMPT = """Summarize the key decisions, findings, and current state 
from this conversation. Include: files modified, tests run, errors encountered, 
and the current plan. Be concise — under 500 words."""

def active_summarize(messages: list[dict]) -> str:
    """Ask the model to produce a checkpoint summary."""
    response = llm.chat(
        messages=messages + [{"role": "user", "content": SUMMARIZE_PROMPT}],
        max_tokens=1024,
    )
    return response.choices[0].message.content
```

## Token 预算实战

128K Context Window 的实际 Token 算术：

```
总容量:                     128,000 tokens
回复预留:                    -4,096
System Prompt:                -500
Tool Schema (12 个 Tool):    -2,400
MEMORY.md:                   -1,200
AGENTS.md:                     -800
─────────────────────────────────────
可用于对话:                 119,004 tokens

按每词约 3 个 Token，大约 39,600 词的对话空间。
一个 50 轮的编码 Session 含 Tool 结果：约 60,000 tokens。
→ 不做压缩的话，大约第 35 轮就会撞到预算上限。
```

结论：对于任何非 trivial 的 Session，压缩都不是可选项。

## Context 注入模式

Context 不仅来自对话历史。五种常见注入模式：

| 模式 | 时机 | 示例 |
|---------|------|---------|
| **文件注入** | Session 启动 | 加载 AGENTS.md、MEMORY.md、相关源文件 |
| **Memory 注入** | Session 启动 | 压缩后的长期 Memory + 近期日志 |
| **Tool 结果注入** | 循环中 | 将 Tool 输出作为 tool-role 消息追加 |
| **Skill 注入** | 按需 | 激活 Skill 时加载 SKILL.md |
| **检索注入** | 每次查询 | 从向量数据库获取的 RAG 结果 |

每个注入点都有成本。一个 200 行的源文件大约 800 Token。在对话开始前投机性地注入 10 个文件就是 8K Token。要有意识：注入需要的，而不是*可能*需要的。

## 滑动窗口实现

滑动窗口保持最近几轮完整，并将窗口边界之前的所有内容压缩。这是生产环境 Harness 最实用的策略：

```python
class SlidingWindowContext:
    """Maintain a sliding window over conversation history."""

    def __init__(self, window_size: int = 15, max_tokens: int = 128_000):
        self.window_size = window_size
        self.max_tokens = max_tokens
        self.summary = ""
        self.messages: list[dict] = []

    def add(self, message: dict):
        self.messages.append(message)
        conversation = [m for m in self.messages if m["role"] != "system"]
        if len(conversation) > self.window_size * 3:
            self._compress()

    def _compress(self):
        """Move older messages into a rolling summary."""
        conversation = [m for m in self.messages if m["role"] != "system"]
        system = [m for m in self.messages if m["role"] == "system"]

        old = conversation[:-(self.window_size * 3)]
        recent = conversation[-(self.window_size * 3):]

        new_summary = summarize_with_llm(
            [{"role": "system", "content": self.summary}] + old
        )
        self.summary = new_summary
        self.messages = system + recent

    def get_messages(self) -> list[dict]:
        """Return context-ready message list."""
        result = [m for m in self.messages if m["role"] == "system"]
        if self.summary:
            result.append({
                "role": "system",
                "content": f"[Conversation history summary]\n{self.summary}",
            })
        result.extend(m for m in self.messages if m["role"] != "system")
        return result
```

## 常见陷阱

- **把所有 Context 当同等优先级** —— System Prompt 和任务指令必须存活；旧对话可以压缩。没有优先级，要么在过期消息上浪费空间，要么丢掉关键指令。
- **压缩太激进** —— 摘要是有损的。如果你压缩了一个包含模型后续需要的文件路径的 Tool 结果，模型就会幻觉出路径。保持最近几轮的原文。
- **忽略 Token 计数** —— 目测"这看起来够短了"在复杂场景下很快失效。用实际的 Token 计数工具（tiktoken、模型专用 tokenizer）做预算。
- **一次性 Context 组装** —— 在 Session 开始时组装一次 Context 就不再更新，意味着第一次 Tool 调用后模型就在用过时的信息。每轮都要重新组装 Context。

## 延伸阅读

- [Karpathy: "Context Engineering is the New Prompt Engineering"](https://x.com/karpathy/status/1937902263428948034) — 为什么 Context 组装比 Prompt 技巧更重要
- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — 操作系统启发的 Memory 管理与虚拟 Context
- [OpenAI: Managing Tokens](https://platform.openai.com/docs/guides/text-generation#managing-tokens) — Token 计数基础
