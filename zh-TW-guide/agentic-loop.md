---
author: Nexu
---

# Agentic Loop

> **Core Insight:** 每個 Agent 都是一個迴圈——思考、執行、觀察、重複。迴圈本身很簡單。讓它達到生產級的是邊界處理：什麼時候停止、Tool 失敗怎麼辦、如何防止無限迴圈。

## 模式

Agentic Loop（也叫 ReAct 模式——Reason + Act）是所有 AI Agent 的基本執行週期。模型生成響應，可選地呼叫一個或多個 Tool，觀察結果，迴圈直到任務完成。

```
┌─────────────┐
│   Reason    │◄──────────────────┐
│  (LLM call) │                   │
└──────┬──────┘                   │
       │                          │
       ▼                          │
  ┌─────────┐    No tools    ┌────┴─────┐
  │  Tools? ├───────────────►│  Output  │
  └────┬────┘                └──────────┘
       │ Yes
       ▼
  ┌─────────┐
  │ Execute │
  │  tools  │
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ Observe │
  │ results ├─────────────────────┘
  └─────────┘
```

這和簡單的 Tool 呼叫 API 不同。單次 Tool 呼叫是一次性的：模型說"呼叫這個函式"，你返回結果。**Agentic Loop** 則是反覆執行這個過程——模型看到結果，判斷還需要更多資訊，呼叫另一個 Tool，看到*那個*結果，繼續迴圈直到有足夠的 Context 產出最終答案。

## 實現

Python 中的最小 Agentic Loop：

```python
def agentic_loop(messages: list, tools: list, max_turns: int = 25) -> str:
    """Run the agentic loop until the model produces a final text response."""
    for turn in range(max_turns):
        response = llm.chat(messages=messages, tools=tools)
        assistant_msg = response.choices[0].message
        messages.append(assistant_msg)

        # Exit condition: no tool calls means the model is done
        if not assistant_msg.tool_calls:
            return assistant_msg.content

        # Execute each tool call and append results
        for tool_call in assistant_msg.tool_calls:
            result = dispatch_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result)
            })

    raise AgentLoopError(f"Agent did not complete within {max_turns} turns")
```

`max_turns` 引數至關重要。沒有它，混亂的模型會無限迴圈——反覆呼叫同一個 Tool、得到同樣的錯誤、不斷燒 Token。這是最簡單的 Guardrails，必須始終存在。

## 並行 Tool 呼叫

現代 API 支援**並行 Tool 呼叫**——模型可以在一次響應中請求多個 Tool。這不僅僅是最佳化，它改變了 Agent 行為。需要讀三個檔案的模型會同時請求所有三個，而不是按順序請求：

```python
# A single assistant message might contain:
# tool_calls = [read_file("a.py"), read_file("b.py"), read_file("c.py")]

for tool_call in assistant_msg.tool_calls:
    result = dispatch_tool(tool_call)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": str(result)
    })
# All three results are appended, then the model sees them all at once
```

## 輪次預算與退出條件

迴圈需要明確的退出條件，不只是 `max_turns`：

| 條件 | 處理方式 |
|-----------|--------|
| 響應中沒有 Tool 呼叫 | 返回文本——Agent 已完成 |
| 達到最大輪次 | 丟擲錯誤或強制生成摘要 |
| Token 預算超限 | 觸發 Context 壓縮，繼續執行 |
| 連續相同的 Tool 呼叫 | 很可能卡住了——升級或中止 |
| 人類中斷訊號 | 暫停迴圈，展示當前狀態 |

```python
def detect_loop(messages: list, window: int = 3) -> bool:
    """Detect if the agent is stuck calling the same tool repeatedly."""
    recent_calls = []
    for msg in messages[-window * 2:]:
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            recent_calls.extend(
                (tc.function.name, tc.function.arguments) for tc in msg.tool_calls
            )
    if len(recent_calls) >= window:
        return len(set(recent_calls[-window:])) == 1
    return False
```

## 迴圈中的流式輸出

生產級 Harness 在迴圈執行時逐 Token 流式輸出模型的響應。這對使用者體驗很重要——使用者能即時看到 Agent 在"思考"，而不是盯著空白螢幕：

```python
for turn in range(max_turns):
    stream = llm.chat(messages=messages, tools=tools, stream=True)

    tool_calls = []
    text_chunks = []

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            text_chunks.append(delta.content)
            emit_to_user(delta.content)  # Real-time streaming
        if delta.tool_calls:
            accumulate_tool_calls(tool_calls, delta.tool_calls)

    if not tool_calls:
        return "".join(text_chunks)

    # Execute tools and continue loop
    ...
```

## 常見誤區

- **沒設輪次上限** —— Harness 中最常見的 bug。一定要設最大值。
- **吞掉 Tool 錯誤** —— Tool 靜默失敗的話，模型會重試或幻覺出成功。務必把錯誤資訊作為 Tool 結果返回，讓模型能調整策略。
- **直接追加原始結果** —— 大體積的 Tool 輸出（整個檔案、API 響應）會撐爆 Context 視窗。追加前做截斷或摘要。
- **忽略並行呼叫** —— 如果你的迴圈按順序處理 Tool 呼叫，但模型是並行發出的，你可能引入不存在的順序依賴。

## 延伸閱讀

- [Yao et al., "ReAct: Synergizing Reasoning and Acting"](https://arxiv.org/abs/2210.03629) —— 形式化 Reason + Act 模式的原始論文
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— 生產級迴圈的實踐模式
