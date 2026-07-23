---
author: Nexu
---

# 什麼是 Harness？

> **Core Insight:** 模型正在商品化——GPT、Claude、Gemini 的能力趨於收斂。真正的護城河在 Harness：如何編排 Context、Memory、Tool 和 Agent 生命週期，決定了你交付的是聊天機器人還是生產級 Agent。

## 定義

**Harness** 是將裸語言模型轉化為 **Agent** 的執行時包裝層——一個能感知環境、做出決策、並通過多步操作實現目標的自主系統。

這裡有必要區分一下 "Agent" 的含義。在 2023-2024 年，"Agent" 通常指*模型加 Tool*——給 GPT 一個搜尋工具就叫 Agent。而 Harness Engineering面向的 Agent 複雜得多：

| 元件 | 2023 "Agent" | Harness 時代的 Agent |
|-----------|-------------|-------------------|
| 模型 | ✅ LLM | ✅ LLM |
| Tool | ✅ 函式呼叫 | ✅ 動態 Tool 系統 |
| Memory | ❌ 無狀態 | ✅ 持久化跨 Session Memory |
| Context 管理 | ❌ 簡單粗暴 | ✅ 基於優先順序的 Context 組裝 |
| 編排 | ❌ 單輪 | ✅ Agentic Loop + 錯誤恢復 |
| 執行環境 | ❌ 宿主程序 | ✅ Sandbox 執行時 |
| Guardrails | ❌ 幾乎沒有 | ✅ 權限模型 + 信任邊界 |

Harness 就是提供這一切的工程層。沒有它，你只有一個能調函式的聊天機器人。有了它，你的 Agent 能自主導航程式碼庫、跨檔案修 bug、然後提交結果。

## Harness 的結構

所有 Harness，不論實現方式，都包含四個子系統：

```
┌──────────────────────────────────────────────┐
│                   HARNESS                     │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Agentic  │  │   Tool   │  │  Memory &  │  │
│  │   Loop   │  │  System  │  │  Context   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │            Guardrails                  │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

1. **Agentic Loop** —— 思考 → 執行 → 觀察的迴圈，驅動所有 Agent 行為。模型推理、呼叫 Tool、觀察結果，迴圈直到任務完成。

2. **Tool 系統** —— Agent 可用能力的註冊表：檔案 I/O、Shell 執行、Web 搜尋、API 呼叫。Tool 可以是靜態的（啟動時載入）或動態的（通過 Skill 選單按需載入）。

3. **Memory 與 Context** —— 決定模型能*看到*什麼的系統。涉及三個不同的關注點：
   - **Context** —— 當前 API 呼叫中包含的內容（系統提示、Tool、檔案、對話歷史）
   - **Memory** —— 跨 Session 持久化的內容（MEMORY.md、每日日誌、學習到的偏好）
   - **Session** —— 單次 Agent 執行的邊界（訊息歷史、Tool 結果、臨時狀態）

4. **Guardrails** —— 權限邊界、Sandbox 執行和安全約束。Agent 能做什麼、不能做什麼，以及如何防止 prompt 注入繞過這些邊界。

這四個子系統在[核心概念](/guide/agentic-loop)部分有深入講解。

## 最簡示例

最簡單的 Harness 就是一個迴圈。以下程式碼不適合直接用於生產，但結構是正確的：

```python
import openai

client = openai.OpenAI()
tools = [{"type": "function", "function": {"name": "read_file", ...}}]

messages = [{"role": "system", "content": "You are a coding agent."}]
messages.append({"role": "user", "content": user_input})

# The agentic loop
while True:
    response = client.chat.completions.create(
        model="gpt-4o", messages=messages, tools=tools
    )
    msg = response.choices[0].message
    messages.append(msg)

    if not msg.tool_calls:
        print(msg.content)  # Done — model has no more actions
        break

    for call in msg.tool_calls:
        result = execute_tool(call.function.name, call.function.arguments)
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result
        })
    # Loop back — model sees the tool results and decides next action
```

從 50 行指令碼到 Claude Code，所有 Harness 都是這個迴圈的變體。複雜度來自圍繞它構建的東西：Context 組裝、Memory 持久化、Skill 編排、錯誤恢復和 Sandbox。

## Harness vs. Framework vs. Runtime

這三個術語經常被混淆，但它們是不同的層次：

| 術語 | 角色 | 示例 |
|------|------|----------|
| **Harness** | 將模型包裝成 Agent 的編排程式碼 | Claude Code、Codex CLI、OpenClaw |
| **Framework** | 提供構建 Harness 所需元件的庫 | LangChain、CrewAI、AutoGen |
| **Runtime** | 保持 Harness 執行的持久程序，管理其生命週期，並連線外部世界 | OpenClaw Runtime、Docker 容器、systemd 服務 |

Framework 幫你*構建* Harness。Runtime *託管* Harness——保持存活、處理重連、排程心跳、路由訊息。Harness 本身是編排邏輯：如何組裝 Context、載入哪些 Tool、Agentic Loop 如何執行。

## 常見誤區

- **把模型問題歸咎於 Harness 問題** —— Agent 出錯時，通常是 Context 問題（載入了錯誤的檔案、缺少指令）或 Tool 問題（Schema 不正確、靜默報錯），而不是模型能力問題。
- **一開始就過度工程** —— 從上面的最小迴圈開始。需要跨 Session 狀態時再加 Memory，Tool 太多時再加 Skill，上生產時再加 Guardrails。
- **把 Context 視窗當成無限的** —— 模型只能基於 Context 中的內容推理。如果關鍵資訊沒有被組裝進 prompt，對模型來說它就不存在。

## 延伸閱讀

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/) —— 命名了這一學科的博文
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— Anthropic 的生產級 Agent 模式
