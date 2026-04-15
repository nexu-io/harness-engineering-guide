# 上下文压缩

上下文压缩是在不丢失关键信息的前提下减少 Token 消耗的实践。它不是一种单一技术，而是三道防线：自动衰减被动移除过期内容，阈值压缩在使用量达到上限时触发，主动压缩是 Agent 有意识地对自己的历史做摘要。

## 为什么重要

一个 30 轮的 Agent 会话轻松消耗 100K+ Token。按 $3/M input tokens 计，每次会话 $0.30 — 而且每次后续 API 调用都会重新发送整个历史。到第 30 轮，你在为早期的文件读取一遍又一遍地付费。压缩能降低 40-70% 的成本，并让 Agent 在长任务中保持在 Context Window 之内。

## 第一道防线：自动衰减

自动衰减被动降级旧内容。超过 N 轮的工具结果被替换为摘要或占位符。不需要模型调用 — 纯字符串操作。

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o")

def auto_decay(messages: list[dict], current_turn: int, decay_after: int = 5) -> list[dict]:
    """Replace old tool results with stubs after `decay_after` turns."""
    result = []
    turn = 0

    for msg in messages:
        if msg["role"] == "assistant" and msg.get("tool_calls"):
            turn += 1

        if msg["role"] == "tool":
            content = msg.get("content", "")
            age = current_turn - turn
            token_count = len(enc.encode(content))

            if age > decay_after and token_count > 200:
                # Replace with a stub
                stub = content[:100] + f"\n\n[... {token_count} tokens, {age} turns ago — auto-decayed. Re-read if needed.]"
                result.append({**msg, "content": stub})
                continue

        result.append(msg)

    return result
```

**真实会话的前后对比：**

```
第 15 轮，无衰减:
  总上下文: 67,000 tokens
  工具结果: 45,000 tokens (67%)

第 15 轮，有衰减 (decay_after=5):
  总上下文: 31,000 tokens
  工具结果:  9,000 tokens (29%)
  节省:     36,000 tokens (54%)
```

## 第二道防线：阈值压缩

当总上下文超过阈值时，用一个便宜的模型压缩对话历史。

```python
def threshold_compress(
    client,
    messages: list[dict],
    threshold: int = 80_000,
    target: int = 40_000
) -> list[dict]:
    """When context exceeds threshold, compress history to target size."""
    total = sum(len(enc.encode(m.get("content", "") or "")) for m in messages)

    if total < threshold:
        return messages  # Not yet

    # Separate system messages (never compress) from conversation
    system = [m for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]

    # Keep the most recent 30% of messages untouched
    keep_n = max(4, int(len(conversation) * 0.3))
    to_compress = conversation[:-keep_n]
    to_keep = conversation[-keep_n:]

    # Build compression prompt
    history_text = ""
    for msg in to_compress:
        role = msg["role"]
        content = msg.get("content", "[tool call/result]") or "[tool call]"
        # Truncate individual messages for the compression prompt
        if len(content) > 500:
            content = content[:500] + "..."
        history_text += f"**{role}**: {content}\n\n"

    compression_prompt = f"""Compress this conversation history into a concise summary.
Preserve: key decisions, file paths mentioned, errors encountered, current task state.
Drop: verbose tool outputs, redundant information, pleasantries.
Target: ~500 words.

{history_text}"""

    summary_resp = client.chat.completions.create(
        model="gpt-4o-mini",  # Cheap model for compression
        messages=[{"role": "user", "content": compression_prompt}],
        max_tokens=800
    )
    summary = summary_resp.choices[0].message.content

    # Inject as a system message
    compressed = system + [
        {"role": "system", "content": f"## Compressed History\n{summary}"},
        *to_keep
    ]

    new_total = sum(len(enc.encode(m.get("content", "") or "")) for m in compressed)
    print(f"Compressed: {total:,} → {new_total:,} tokens ({100 - new_total*100//total}% reduction)")

    return compressed
```

**典型效果：**

```
压缩前: 85,000 tokens（触发阈值）
压缩后: 32,000 tokens
压缩调用成本: ~$0.003 (gpt-4o-mini)
后续 10 轮的节省: ~$0.15（避免每轮重发 53K tokens）
ROI: 50x
```

## 第三道防线：主动压缩

Agent 自己决定压缩。添加一个让模型在发现上下文变大时触发压缩的工具：

```python
def compress_context_tool(messages: list[dict], client) -> str:
    """Tool the agent calls to compress its own history."""
    total = sum(len(enc.encode(m.get("content", "") or "")) for m in messages)

    if total < 30_000:
        return "Context is only {total} tokens — no compression needed."

    # Let the agent choose what to keep
    compressed = threshold_compress(client, messages, threshold=0, target=total // 2)
    new_total = sum(len(enc.encode(m.get("content", "") or "")) for m in compressed)

    # Update the messages list in-place
    messages.clear()
    messages.extend(compressed)

    return f"Compressed context from {total:,} to {new_total:,} tokens ({total - new_total:,} freed)."

# Register as a tool
compress_tool = {
    "type": "function",
    "function": {
        "name": "compress_context",
        "description": "Compress conversation history to free context window space. "
                       "Use when you notice the conversation is getting long or when "
                       "you need space for large file reads.",
        "parameters": {"type": "object", "properties": {}}
    }
}
```

有了这个工具，Agent 可能会说：

> "这次重构我需要读好几个大文件。让我先压缩之前的调试对话。"
>
> 🔧 compress_context()
> → "Compressed context from 72,000 to 28,000 tokens (44,000 freed)."

## 三道防线协同

```python
class ContextManager:
    def __init__(self, client, model="gpt-4o"):
        self.client = client
        self.model = model
        self.turn = 0

    def process(self, messages: list[dict]) -> list[dict]:
        """Run all three compression lines in order."""
        self.turn += 1

        # Line 1: Auto-decay old tool results (free, always runs)
        messages = auto_decay(messages, self.turn, decay_after=5)

        # Line 2: Threshold compression (costs one cheap API call)
        messages = threshold_compress(self.client, messages, threshold=80_000)

        return messages

    def make_api_call(self, messages, tools):
        """Wrap the API call with context management."""
        managed = self.process(messages)

        response = self.client.chat.completions.create(
            model=self.model, messages=managed, tools=tools
        )

        total = sum(len(enc.encode(m.get("content", "") or "")) for m in managed)
        print(f"  📊 Context: {total:,} tokens | Turn: {self.turn}")

        return response
```

## 整个会话的 Token 节省

30 轮会话，有无压缩的对比：

```
轮次 │ 无压缩          │ 有压缩           │ 节省
─────┼────────────────┼──────────────────┼────────
  1  │      2,100     │       2,100      │    0%
  5  │     15,000     │      12,000      │   20%
 10  │     42,000     │      24,000      │   43%
 15  │     67,000     │      31,000      │   54%
 20  │     95,000     │      38,000      │   60%
 25  │    118,000     │      42,000      │   64%
 30  │    溢出 ❌      │      45,000      │    —

累计 input tokens 计费:
  无压缩:    ~1,200,000 tokens ($3.60)
  有压缩:      ~480,000 tokens ($1.44)
  总节省: 每次会话 $2.16 (60%)
```

## 压缩质量

好的压缩的关键：保留**决策**和**状态**，丢弃**内容**。

好的压缩保留：
- "用户要重构 auth 模块改用 JWT"
- "在 `src/auth.py:142` 发现 bug — 缺少 null 检查"
- "PR #247 修复后测试通过"

好的压缩丢弃：
- 实际文件内容（Agent 可以重新读取）
- 冗长的测试输出（只保留通过/失败）
- 搞明白一个问题的来回过程（只保留结论）

## 常见陷阱

- **压缩过于激进** — 如果 Agent 丢失了对当前任务的追踪，说明压缩太多了。始终保留最后 30% 的对话不动。
- **Token 计数不准** — OpenAI 模型用 `tiktoken`。粗略估算（1 Token ≈ 4 字符）偏差 20-30%，会导致溢出。
- **压缩 system prompt** — 永远不要压缩 system prompt、AGENTS.md 或 MEMORY.md。这些是 Agent 的身份和指令 — 必须逐字保留。

## 延伸阅读

- [LLMLingua](https://github.com/microsoft/LLMLingua) — 微软的 prompt 压缩库
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — 为什么上下文中的位置很重要
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — 缓存静态上下文避免重复处理
