# 上下文窗口管理

Context Window 是模型在单次 API 调用中能看到的所有内容 — system prompt、工具、记忆、对话历史和文件。管理它就是决定什么放进去、什么留在外面、什么需要压缩的艺术。搞砸了，你的 Agent 会丢失指令、产生幻觉，或者在任务进行到一半时空间就用完了。

## 为什么重要

模型有有限的 Context Window：GPT-4o 128K Token，Claude 3.5 Sonnet 200K，Gemini 1.5 Pro 1M。听起来很多，但一个代码库就可能有 500K+ Token。一天的对话历史可能 30K Token。每个工具定义、每次文件读取、每条系统指令都在争夺同样的空间。不主动管理的话，10 分钟的工作就能把窗口打爆。

## 优先级系统

不是所有上下文都同等重要。使用优先级层级：

```
优先级 1（始终加载）:  System prompt + AGENTS.md
优先级 2（始终加载）:  工具定义（仅活跃工具）
优先级 3（始终加载）:  MEMORY.md（精选长期记忆）
优先级 4（空间足够则加载）: 用户正在处理的文件
优先级 5（空间足够则加载）: 近期对话历史
优先级 6（压缩）:     较早的对话历史
优先级 7（丢弃）:     过期文件内容、旧工具结果
```

### 实现

```python
from dataclasses import dataclass

@dataclass
class ContextBlock:
    name: str
    content: str
    priority: int         # 1 = highest
    tokens: int           # Pre-counted
    compressible: bool    # Can this be summarized?

def assemble_context(blocks: list[ContextBlock], budget: int) -> list[ContextBlock]:
    """Pack context blocks into the token budget by priority."""
    # Sort by priority (lowest number = highest priority)
    sorted_blocks = sorted(blocks, key=lambda b: b.priority)

    selected = []
    used = 0

    for block in sorted_blocks:
        if used + block.tokens <= budget:
            selected.append(block)
            used += block.tokens
        elif block.compressible:
            # Try to compress to fit
            compressed = compress_block(block, budget - used)
            if compressed and compressed.tokens <= budget - used:
                selected.append(compressed)
                used += compressed.tokens
        # else: drop it

    return selected
```

## Token 预算分配

128K Token 模型的实际分配方案：

```
┌──────────────────────────────────────────────────┐
│              128K Token 预算                      │
├──────────────────────────────────────────────────┤
│ System Prompt + AGENTS.md      │    2,000 (1.6%) │
│ Tool Schemas (5-10 tools)      │    2,000 (1.6%) │
│ MEMORY.md                      │      700 (0.5%) │
│ ─────────────────────────────  │ ──────────────  │
│ 保留区（始终加载）               │    4,700 (3.7%) │
│                                │                  │
│ 活跃文件                        │   20,000 (15.6%)│
│ 对话历史                        │   60,000 (46.9%)│
│ ─────────────────────────────  │ ──────────────  │
│ 工作空间                        │   80,000 (62.5%)│
│                                │                  │
│ 模型输出                        │    8,000 (6.3%) │
│ 安全余量                        │   35,300 (27.5%)│
│ ─────────────────────────────  │ ──────────────  │
│ 预留空间                        │   43,300 (33.8%)│
└──────────────────────────────────────────────────┘
```

安全余量很重要 — 工具结果的大小不可预测。一次 `read_file` 调用可能返回 50 Token，也可能返回 50,000 Token。预算要保守。

## 对话历史的滑动窗口

最简单的方案：保留最近的消息，丢弃旧的。

```python
import tiktoken

def sliding_window(messages: list[dict], max_tokens: int, model: str = "gpt-4o") -> list[dict]:
    """Keep the most recent messages that fit within the token budget.
    Always preserves the system message and the first user message."""
    enc = tiktoken.encoding_for_model(model)

    def count(msg):
        return len(enc.encode(msg.get("content", "") or "")) + 4  # ~4 tokens overhead per message

    # Always keep system prompt and first user message
    preserved = []
    remaining = []
    for i, msg in enumerate(messages):
        if msg["role"] == "system" or (msg["role"] == "user" and i <= 1):
            preserved.append(msg)
        else:
            remaining.append(msg)

    budget = max_tokens - sum(count(m) for m in preserved)

    # Fill from the end (most recent first)
    selected = []
    used = 0
    for msg in reversed(remaining):
        msg_tokens = count(msg)
        if used + msg_tokens > budget:
            break
        selected.insert(0, msg)
        used += msg_tokens

    return preserved + selected
```

## 智能截断

不做硬截断，而是对被丢弃的内容做摘要：

```python
def sliding_window_with_summary(
    client, messages: list[dict], max_tokens: int
) -> list[dict]:
    """Like sliding window, but summarizes dropped messages."""
    enc = tiktoken.encoding_for_model("gpt-4o")

    # Count total tokens
    total = sum(len(enc.encode(m.get("content", "") or "")) for m in messages)

    if total <= max_tokens:
        return messages  # Everything fits

    # Split: keep first message + system, summarize middle, keep recent
    system_msgs = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    # Keep the last 60% of conversation tokens
    keep_count = int(len(conversation) * 0.6)
    to_summarize = conversation[:-keep_count]
    to_keep = conversation[-keep_count:]

    # Summarize the dropped portion
    summary_prompt = "Summarize this conversation concisely, preserving key decisions and context:\n\n"
    for msg in to_summarize:
        summary_prompt += f"{msg['role']}: {msg.get('content', '[tool call]')}\n"

    summary_resp = client.chat.completions.create(
        model="gpt-4o-mini",  # Cheap model for summaries
        messages=[{"role": "user", "content": summary_prompt}],
        max_tokens=500
    )
    summary = summary_resp.choices[0].message.content

    # Reconstruct
    return system_msgs + [
        {"role": "system", "content": f"## Earlier Conversation Summary\n{summary}"},
        *to_keep
    ]
```

## 文件内容管理

大文件读取是 Context Window 最大的威胁。需要主动管理：

```python
def smart_read_file(path: str, max_lines: int = 200) -> str:
    """Read a file with intelligent truncation."""
    with open(path) as f:
        lines = f.readlines()

    if len(lines) <= max_lines:
        return "".join(lines)

    # Show first 100 and last 100 lines
    head = "".join(lines[:100])
    tail = "".join(lines[-100:])
    skipped = len(lines) - 200

    return f"{head}\n\n... ({skipped} lines omitted) ...\n\n{tail}"


def evict_stale_files(messages: list[dict], max_age: int = 5) -> list[dict]:
    """Replace old file contents with a summary after N turns."""
    result = []
    turn_count = 0

    for msg in messages:
        if msg["role"] == "assistant":
            turn_count += 1

        if msg["role"] == "tool" and turn_count > max_age:
            content = msg.get("content", "")
            if len(content) > 500:
                # Replace large tool outputs with a summary
                msg = {**msg, "content": f"[File content from {max_age}+ turns ago — evicted to save context. Re-read if needed.]"}

        result.append(msg)

    return result
```

## 真实数据

编码会话中上下文的增长速度：

```
第 1 轮:  用户要求修一个 bug
          System prompt:    2,000 tokens
          用户消息:           100 tokens
          总计:             2,100 tokens

第 2 轮:  Agent 读取 3 个文件
          工具调用:           150 tokens
          文件内容:         8,000 tokens
          总计:            10,250 tokens

第 3 轮:  Agent 写修复代码
          分析:             1,000 tokens
          工具调用:           200 tokens
          总计:            11,450 tokens

第 5 轮:  Agent 读取测试输出
          测试结果:         2,000 tokens
          总计:            15,450 tokens

第 10 轮: 深度调试
          更多文件:        12,000 tokens
          总计:            35,000 tokens

第 20 轮: 复杂重构
          大量文件 + 历史
          总计:            80,000+ tokens  ← 逼近上限
```

不做管理的话，30 轮编码会话轻松超过 128K Token。

## 常见陷阱

- **需要一个函数却加载整个文件** — 用定向读取（`grep`、行范围）代替读取整个文件。一个 2,000 行的文件约 10,000 Token；你需要的函数只有 200 Token。
- **永远保留所有工具结果** — 15 轮之前读取的文件内容几乎肯定已经过期。淘汰它或者做摘要。
- **忽视输出 Token 预算** — 如果你设置 `max_tokens=8000` 给模型的回复，但只剩 2,000 Token 的余量，回复会被静默截断。

## 延伸阅读

- [Anthropic: Long Context Tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — 重复上下文的 prompt 缓存
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — 关于模型如何处理长上下文中信息位置的研究
- [tiktoken](https://github.com/openai/tiktoken) — OpenAI 的快速 Token 计数器

---

*下一篇: [上下文压缩 →](context-compression.md)*
