# Context Compression

Context compression is the practice of reducing token usage without losing critical information. It's not a single technique but three lines of defense: auto-decay removes stale content passively, threshold compression triggers when usage hits a limit, and active compression is the agent deliberately summarizing its own history.

## Why It Matters

A 30-turn agent session can easily consume 100K+ tokens. At $3/M input tokens, that's $0.30 per session — and each subsequent API call resends the entire history. By turn 30, you're paying for those early file reads over and over. Compression cuts costs 40-70% and keeps the agent within its context window on long tasks.

## Line 1: Auto-Decay

Auto-decay passively degrades old content. Tool results older than N turns get replaced with summaries or stubs. No model call needed — it's pure string manipulation.

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

**Before/after on a real session:**

```
Turn 15, no decay:
  Total context: 67,000 tokens
  Tool results:  45,000 tokens (67%)

Turn 15, with decay (decay_after=5):
  Total context: 31,000 tokens
  Tool results:  9,000 tokens (29%)
  Savings:       36,000 tokens (54%)
```

## Line 2: Threshold Compression

When total context exceeds a threshold, compress the conversation history using a cheap model.

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

**Typical results:**

```
Before: 85,000 tokens (threshold hit)
After:  32,000 tokens
Cost of compression call: ~$0.003 (gpt-4o-mini)
Savings on next 10 turns: ~$0.15 (avoiding resending 53K tokens each turn)
ROI: 50x
```

## Line 3: Active Compression

The agent itself decides to compress. Add a tool that lets the model trigger compression when it notices the context is getting large:

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

With this tool, the agent might say:

> "I need to read several large files for this refactor. Let me compress the earlier debugging conversation first."
>
> 🔧 compress_context()
> → "Compressed context from 72,000 to 28,000 tokens (44,000 freed)."

## All Three Together

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

## Token Savings Over a Session

A 30-turn session with and without compression:

```
Turn │ No Compression │ With Compression │ Savings
─────┼────────────────┼──────────────────┼────────
  1  │      2,100     │       2,100      │    0%
  5  │     15,000     │      12,000      │   20%
 10  │     42,000     │      24,000      │   43%
 15  │     67,000     │      31,000      │   54%
 20  │     95,000     │      38,000      │   60%
 25  │    118,000     │      42,000      │   64%
 30  │    OVERFLOW ❌  │      45,000      │    —

Cumulative input tokens billed:
  No compression:  ~1,200,000 tokens ($3.60)
  With compression:  ~480,000 tokens ($1.44)
  Total savings: $2.16 per session (60%)
```

## Compression Quality

The key to good compression: preserve **decisions** and **state**, drop **content**.

Good compression keeps:
- "User wants to refactor auth module to use JWT"
- "Found bug in `src/auth.py:142` — missing null check"
- "Tests passing after fix in PR #247"

Good compression drops:
- The actual file contents (agent can re-read them)
- Verbose test output (just keep pass/fail)
- The back-and-forth of figuring something out (just keep the conclusion)

## Common Pitfalls

- **Compressing too aggressively** — If the agent loses track of what it was doing, you compressed too much. Always keep the last 30% of conversation untouched.
- **Not counting tokens accurately** — Use `tiktoken` for OpenAI models. Rough estimates (1 token ≈ 4 chars) are off by 20-30% and lead to overflow.
- **Compressing system prompts** — Never compress the system prompt, AGENTS.md, or MEMORY.md. These are the agent's identity and instructions — they must remain verbatim.

## Further Reading

- [LLMLingua](https://github.com/microsoft/LLMLingua) — Microsoft's prompt compression library
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — Why position in context matters
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — Cache static context to avoid re-processing
