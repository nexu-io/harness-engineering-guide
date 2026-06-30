---
author: Nexu
---

# Context 工程

> **核心洞察：** 模型不知道你沒告訴它的事。Context 工程是一門決定什麼進入 Context Window、以什麼順序、空間不夠時砍掉什麼的學科。這是 Harness Engineering中槓桿最高的工作——比選模型、調 Prompt、設計 Tool 都重要。

## 問題

128K Token 的 Context Window 聽起來很大，直到你開始往裡塞東西。一個大檔案可以吃掉 10K Token，二十個 Tool Schema 吃掉 3K，對話歷史每輪線性增長。一個複雜編碼任務跑十幾輪後，你已經在做艱難的取捨了。

Context 工程就是這些取捨的藝術。它有三大支柱：**組裝**（放什麼進去）、**壓縮**（縮減什麼）和**預算**（如何分配容量）。

## Context 組裝優先順序系統

不是所有 Context 都同等重要。優先順序系統確保空間緊張時最關鍵的資訊能存活：

| 優先順序 | 類別 | 典型 Token 數 | 說明 |
|----------|----------|---------------|-------|
| 0（最高） | System Prompt | 300–800 | 身份、行為規則、安全約束 |
| 1 | 活躍 Tool Schema | 1,000–3,000 | 只加載已啟用的 Skill，不是全部 Tool |
| 2 | 任務指令 | 200–1,000 | 當前使用者請求 + 任何固定目標 |
| 3 | Memory 摘要 | 500–2,000 | 壓縮後的 MEMORY.md + 當天日誌 |
| 4 | 注入檔案 | 2,000–20,000 | AGENTS.md、SKILL.md、相關原始檔 |
| 5 | 近期對話 | 5,000–50,000 | 最近 N 輪訊息 + Tool 結果 |
| 6（最低） | 更早的對話 | 剩餘空間 | 更早的輪次，最先被壓縮或丟棄 |

組裝器從上到下遍歷這個列表，填充內容直到預算耗盡。低優先順序的內容會被截斷或完全排除。

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

`reserve` 引數容易被忽視但至關重要——你需要給模型回覆留出空間。如果把 Context 塞到 100%，模型就沒地方回覆了。

## Context 壓縮：三道防線

隨著 Session 推進，原始對話歷史無限增長。三種技術可以防止它吞噬整個 Context Window：

### 第一道：自動衰減

較早的訊息自然會失去相關性。簡單的衰減策略丟棄固定視窗外的訊息，只保留最近 N 輪：

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

### 第二道：閾值壓縮

當總 Token 數超過閾值（如預算的 70%）時，將較早的對話輪壓縮成摘要，同時保留最近幾輪的原文：

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

### 第三道：主動摘要

對於超長任務，定期提取關鍵事實和決策到一個滾動摘要文件中。這不是自動的——Harness 需要顯式地讓模型生成 Checkpoint：

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

## Token 預算實戰

128K Context Window 的實際 Token 算術：

```
總容量:                     128,000 tokens
回覆預留:                    -4,096
System Prompt:                -500
Tool Schema (12 個 Tool):    -2,400
MEMORY.md:                   -1,200
AGENTS.md:                     -800
─────────────────────────────────────
可用於對話:                 119,004 tokens

按每詞約 3 個 Token，大約 39,600 詞的對話空間。
一個 50 輪的編碼 Session 含 Tool 結果：約 60,000 tokens。
→ 不做壓縮的話，大約第 35 輪就會撞到預算上限。
```

結論：對於任何非 trivial 的 Session，壓縮都不是可選項。

## Context 注入模式

Context 不僅來自對話歷史。五種常見注入模式：

| 模式 | 時機 | 示例 |
|---------|------|---------|
| **檔案注入** | Session 啟動 | 載入 AGENTS.md、MEMORY.md、相關原始檔 |
| **Memory 注入** | Session 啟動 | 壓縮後的長期 Memory + 近期日誌 |
| **Tool 結果注入** | 迴圈中 | 將 Tool 輸出作為 tool-role 訊息追加 |
| **Skill 注入** | 按需 | 啟用 Skill 時載入 SKILL.md |
| **檢索注入** | 每次查詢 | 從向量資料庫獲取的 RAG 結果 |

每個注入點都有成本。一個 200 行的原始檔大約 800 Token。在對話開始前投機性地注入 10 個檔案就是 8K Token。要有意識：注入需要的，而不是*可能*需要的。

## 滑動視窗實現

滑動視窗保持最近幾輪完整，並將視窗邊界之前的所有內容壓縮。這是生產環境 Harness 最實用的策略：

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

## 常見陷阱

- **把所有 Context 當同等優先順序** —— System Prompt 和任務指令必須存活；舊對話可以壓縮。沒有優先順序，要麼在過期訊息上浪費空間，要麼丟掉關鍵指令。
- **壓縮太激進** —— 摘要是有損的。如果你壓縮了一個包含模型後續需要的檔案路徑的 Tool 結果，模型就會幻覺出路徑。保持最近幾輪的原文。
- **忽略 Token 計數** —— 目測"這看起來夠短了"在複雜場景下很快失效。用實際的 Token 計數工具（tiktoken、模型專用 tokenizer）做預算。
- **一次性 Context 組裝** —— 在 Session 開始時組裝一次 Context 就不再更新，意味著第一次 Tool 呼叫後模型就在用過時的資訊。每輪都要重新組裝 Context。

## 延伸閱讀

- [Karpathy: "Context Engineering is the New Prompt Engineering"](https://x.com/karpathy/status/1937902263428948034) — 為什麼 Context 組裝比 Prompt 技巧更重要
- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) — 作業系統啟發的 Memory 管理與虛擬 Context
- [OpenAI: Managing Tokens](https://platform.openai.com/docs/guides/text-generation#managing-tokens) — Token 計數基礎
