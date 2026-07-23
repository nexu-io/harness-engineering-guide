---
title: "定時任務與自動化"
section: practice
author: Nexu
---

> **Core Insight:** 只在被問到時才回應的 Agent 是聊天機器人；按時間表、按事件、主動行動的 Agent 才是生產力系統。

## 為什麼需要定時任務？

大多數人把 Agent 當作對話介面——你輸入，它回覆。這種心智模型把價值上限定在了"更快的搜尋引擎"。真正的解鎖發生在 Agent *不被要求*也能執行工作時。

對比一下：

- **被動式：** "幫我總結未讀郵件。" → Agent 回覆。
- **定時式：** 每天早上 8:00，Agent 讀取收件箱，按緊急程度過濾，格式化日報，推送到你的 Slack 頻道。你醒來時看到一份從未請求過的簡報。

第二種模式會複利。一個定時任務每天省你五分鐘。十個定時任務重塑你的工作方式。定時任務將 Agent 從一個你使用的工具變成一個為你工作的系統。

本章介紹在 Harness（託管 Agent 的 Tool、Context、Memory 和執行生命週期的 Runtime 環境）中實現定時 Agent 工作的原語。

---

## 定時 Agent 工作的型別

並非所有自動化都遵循相同的節奏。四種模式覆蓋了全貌：

### One-Shot Timer（一次性定時器）

單次延遲執行。使用者說"20 分鐘後提醒我"或"下午 3 點發那封跟進郵件"。Harness 建立一個定時器，觸發一次，然後丟棄。

關鍵特性：
- 僅觸發一次
- 通常在對話中建立（"提醒我……"）
- 短週期——分鐘到小時，很少到天
- 不需要迴圈邏輯

One-Shot Timer 是最簡單的排程原語。只需一個時間戳和一個載荷。

### Recurring Cron（迴圈 Cron）

Cron（得名於 Unix `cron` 守護程序）是按 Cron 表示式定義的重複計劃執行的任務——一種指定分鐘、小時、日、月和星期幾的緊湊語法。

示例：
- `0 8 * * *` → 每天 08:00
- `0 9 * * 1` → 每週一 09:00
- `*/30 * * * *` → 每 30 分鐘

Cron 是 Agent 自動化的骨幹。日報、週報、週期性監控——都是 Cron 的領地。

### Event-Triggered（事件觸發）

並非所有排程都基於時間。有些工作應該響應外部事件觸發：

- 新的 Pull Request 被開啟 → 生成 Review Agent
- 部署完成 → 執行冒煙測試並報告
- 來自 VIP 發件人的新郵件 → 總結並告警

事件觸發自動化需要事件源（Webhook、輪詢或平臺整合）和一個在事件觸發時建立 Agent Turn 的分發機制。Harness 在這裡不按時鐘執行——它按訊號執行。

### Heartbeat-Based（心跳式）

Heartbeat 是一種週期性輪詢，Harness 按固定間隔（通常每 15-60 分鐘）向 Agent 的*主 Session* 注入一個 Prompt。Agent 讀取 Prompt，決定檢查什麼，然後行動或保持沉默。

與建立隔離執行的 Cron 不同，Heartbeat 在進行中的對話內執行。Agent 可以訪問最近的訊息、使用者 Context 和 Session 狀態。這使 Heartbeat 非常適合將多個輕量檢查批次合併到單輪中。

典型的 Heartbeat Prompt：

```
Read HEARTBEAT.md if it exists. Follow it strictly.
If nothing needs attention, reply HEARTBEAT_OK.
```

Agent 可能檢查郵件、看看日曆、檢視通知——全在一輪中完成，全都有對話 Context。

---

## Cron 實現模式

Cron 是最結構化的排程原語。正確實現需要關注四個維度：排程定義、Session 目標、載荷型別和交付。

### 排程定義

**Cron 表示式** 使用標準五欄位格式：

```
┌───────── 分鐘 (0–59)
│ ┌─────── 小時 (0–23)
│ │ ┌───── 日 (1–31)
│ │ │ ┌─── 月 (1–12)
│ │ │ │ ┌─ 星期幾 (0–7, 0 和 7 = 週日)
│ │ │ │ │
* * * * *
```

**時區處理** 是 Cron Bug 最常見的來源。規則很簡單：

> **儲存 UTC。顯示本地時間。**

內部，Harness 按 UTC 評估所有 Cron 表示式。向用戶展示計劃時，轉換為本地時區。當用戶說"每天早上 8 點"，Harness 必須知道*哪個* 8 點——如果不知道就詢問時區，儲存 UTC 等價值，用本地時間確認。

```
使用者："每天早上 8 點跑我的日報"
Agent："好的——每日日報 8:00 AM Asia/Shanghai（UTC 0:00）。✓"
```

這避免了歧義，也能正確處理夏令時轉換（對於實施夏令時的時區）。

### Session 目標

當 Cron 觸發時，Agent *在哪裡*執行？兩種模型：

**隔離 Session** —— Cron 生成一個獨立的 Agent Turn，擁有全新的 Context Window。沒有對話歷史。沒有之前的訊息。Agent 從乾淨狀態開始，執行任務，然後終止。

優點：
- 無歷史汙染——主 Session 保持乾淨
- 可預測的 Context——Agent 只看到 Cron 提供的內容
- 可並行化——多個 Cron 任務可以併發執行互不干擾
- 可配置——每個任務可以使用不同的 Model 或 Thinking 級別

隔離 Session 適用於獨立任務：日報、報告、監控檢查、資料採集。

**主 Session** —— Cron 將內容注入使用者當前活躍的 Session。Agent 看到完整的對話歷史，可以引用最近的訊息。

優點：
- 對話 Context——Agent 知道你一直在討論什麼
- 連續性——可以跟進之前的話題
- 更低開銷——不需要建立新 Session

謹慎使用主 Session 注入。每次注入都會增加 Context Window，過多會膨脹（見下方反模式）。

### 載荷型別

Cron 觸發時究竟交付什麼？

**agentTurn** —— 觸發完整的 Agent 執行週期。Agent 收到 Prompt，可以訪問所有 Tool 和 Skill，能做決策、呼叫 API、讀檔案、產出輸出。這是最強大的載荷型別。

例如：日報 Cron 用 `agentTurn` 載荷觸發。Agent 通過 IMAP 讀郵件，檢查日曆，獲取天氣，格式化為簡報，推送到頻道。完全自主。

**systemEvent** —— 向 Session 注入一條文本訊息，但不觸發完整的 Agent Turn。可以理解為往對話裡丟一張便條。Agent 會在下一輪（或 Heartbeat）時看到它，但不會立即行動。

例如：Webhook 收到部署通知，注入"Deploy v2.3.1 部署成功"作為 systemEvent。Agent 不需要行動——但如果使用者問起，資訊是可用的。

### 交付

結果去哪裡？

- **Announce to channel** —— Agent 的輸出被推送到特定訊息頻道（Slack、Discord、飛書群等）。這是日報和告警最常見的交付方式。
- **Webhook** —— 結果被 POST 到 HTTP 端點，用於與外部系統整合。
- **None（靜默）** —— Cron 執行但不產出外部輸出。適用於後臺維護任務如 Memory 清理或資料預取。

交付配置應在 Cron 建立時設定，並繫結到發起 Session。如果使用者在飛書群建立 Cron，結果應交付到那個群——而不是追隨使用者到他們最近聊天的地方。

---

## 實際案例

### LangSmith Deployments Cron

LangChain 的 LangSmith 平臺為其 Deployments 功能引入了 Cron 任務（參見 [LangSmith Cron Jobs 文件](https://docs.langchain.com/langsmith/cron-jobs)）。模型：

1. 建立一個 Deployment（託管的 LangGraph Agent）
2. 定義 Cron 計劃
3. 每次觸發時，系統建立一個新 Thread 併發送固定輸入

這種方法乾淨且可預測。每次執行獲得相同輸入、全新 Thread，並在 LangSmith 的監控 UI 中產出可追蹤的輸出。

**優勢：**
- 簡單的心智模型——相同輸入，全新 Thread，每次如此
- 通過 LangSmith Trace 的完整可觀測性
- 與 LangGraph 的狀態管理整合

**侷限：**
- 每個 Cron 固定輸入——無法根據 Context 動態調整 Agent 行為
- 每次執行一個 Thread 意味著執行之間沒有連續性
- 繫結 LangSmith 的 Deployment 基礎設施

### Harness 原生 Cron

Harness 模式提供更豐富的模型：

1. 用計劃、Session 目標、載荷和交付定義 Cron
2. 每次觸發時，Harness 生成一個隔離 Session（或注入主 Session）
3. Agent 擁有完整的 Tool 訪問——可以讀檔案、呼叫 API、搜尋網頁、使用任何已安裝的 Skill
4. 結果交付到配置的頻道

```yaml
# 概念性 Cron 定義
schedule: "0 8 * * *"          # 8:00 AM UTC
timezone: "Asia/Shanghai"       # 顯示參考
session: isolated               # 每次執行全新 Context
payload: agentTurn              # 完整 Agent 執行
model: claude-sonnet            # 可不同於預設
delivery:
  type: announce
  channel: feishu-group-abc     # 繫結到發起 Session
prompt: |
  生成今天的早間簡報：
  1. 檢查未讀郵件中的緊急事項
  2. 列出今天的日曆事件
  3. 總結過夜的 GitHub 通知
  格式化為簡潔日報。
```

**與 LangSmith 的關鍵區別：**
- 動態 Prompt——Agent 決定做什麼，而非僅處理固定輸入
- 完整 Skill 訪問——可使用 Harness 提供的任何 Tool
- 按任務選擇 Model——簡單檢查用便宜 Model，分析用強 Model
- 靈活交付——頻道、Webhook 或靜默

### 日報模式

最常見的 Cron 用例。流程：

```
Cron 觸發（本地 8:00 AM）
  → Agent 在隔離 Session 中生成
  → 讀郵件（IMAP Tool）
  → 讀日曆（Calendar Tool）
  → 查天氣（Weather Skill）
  → 查 GitHub 通知（GitHub Skill）
  → 格式化日報，標註優先順序和要點
  → 推送到使用者首選頻道
  → Session 終止
```

價值乘數：這每天都執行，不管使用者記不記得去問。資訊到達時已預處理和格式化。

### 監控模式

一個檢查指標並僅在閾值被突破時告警的 Cron：

```
Cron 觸發（每 15 分鐘）
  → Agent 檢查 API 響應時間
  → 與閾值對比（p99 < 500ms）
  → 如果健康：靜默（不交付）
  → 如果降級：向運維頻道發告警並附詳情
  → Session 終止
```

關鍵設計選擇：**異常告警，而非每次檢查都推送。** 每 15 分鐘推送"一切正常"的監控 Cron 是噪音。保持沉默直到出問題的才是訊號。

---

## Heartbeat vs Cron：何時使用哪個

Heartbeat 和 Cron 都能實現週期性 Agent 工作。它們服務不同目的。

| 維度 | Heartbeat | Cron |
|------|-----------|------|
| **時間精度** | 近似（允許漂移） | 精確（按計劃觸發） |
| **Context** | 主 Session（完整歷史） | 隔離（全新 Context） |
| **每輪檢查數** | 多個（批次） | 單任務聚焦 |
| **Session 影響** | 增加主 Context Window | 不影響主 Session |
| **配置方式** | 編輯 HEARTBEAT.md | 顯式 Cron 定義 |
| **Model** | 使用 Session 的 Model | 可按任務指定 |

**使用 Heartbeat 當：**
- 你想把 3-5 個輕量檢查（郵件 + 日曆 + 通知）批次合併到一輪
- Agent 需要對話 Context 來判斷什麼重要
- 時間精度不重要（大約每 30 分鐘就行）
- 你想通過合併週期檢查來減少總 API 呼叫

**使用 Cron 當：**
- 精確時間很重要（"每週一早上 9:00 準時"）
- 任務應在隔離環境中執行，不汙染主 Session
- 你想為任務使用不同的 Model 或 Thinking 預算
- 輸出應交付到特定頻道，不碰主 Session
- 一次性提醒（"20 分鐘後提醒我"）

**經驗法則：** 如果你有五件事要週期檢查且都不要求精確時間，把它們放在 HEARTBEAT.md 裡，而不是建立五個 Cron 任務。如果你有一個任務必須在精確的早上 9 點用特定 Model 執行並交付到特定頻道，那就是 Cron。

---

## 反模式

### 輪詢迴圈

```python
# ❌ 不要這樣做
while True:
    result = check_something()
    if result.changed:
        notify()
    sleep(60)
```

這會佔用持久程序，浪費計算資源，並繞過 Harness 的排程基礎設施。改用 1 分鐘間隔的 Cron。Harness 管理生命週期、重試和資源清理。

### 主 Session 汙染

向主 Session 注入過多 systemEvent 會膨脹 Context Window。每次注入都增加 Token。經過一天的頻繁注入，Agent 的 Context 被系統噪音主導，而非有用的對話。

**症狀：** Agent 響應變慢，變得不連貫，或丟失對話主題。

**修復：** 高頻工作使用隔離 Session。將主 Session 注入保留給罕見的、高訊號的、使用者需要在 Context 中看到的事件。

### 無超時

可以無限執行的 Cron 任務是資源洩漏。如果 Agent 卡住了（等待 API、陷入推理迴圈），任務會永遠掛起。

**修復：** 每個 Cron 任務都應有超時。合理預設值：簡單任務 2-5 分鐘，複雜任務 10-15 分鐘。如果任務無法在超時視窗內完成，應該大聲失敗——而非靜默掛起。

### 重複交付

```yaml
# ❌ Cron announce 到頻道，同時 Agent 也手動發訊息
delivery:
  type: announce
  channel: slack-general
prompt: |
  檢查指標並把結果發到 #general  # Agent 也發了！
```

如果 Cron 配置為 Announce 結果到頻道，而 Agent 的 Prompt 又指示它向同一頻道發訊息，使用者會收到相同內容兩次。

**修復：** 選擇一種交付機制。要麼讓 Harness Announce，要麼讓 Agent 手動傳送——絕不同時使用。

---

## 設計清單

在建立任何定時 Agent 工作之前：

1. **時區** —— 你知道使用者的時區嗎？如果不知道，問。
2. **Session 型別** —— 需要對話 Context（主 Session）還是乾淨執行（隔離）？
3. **交付** —— 結果去哪裡？繫結到發起 Session。
4. **超時** —— 最大可接受執行時間是多少？
5. **失敗模式** —— 任務失敗怎麼辦？靜默？告警？重試？
6. **頻率** —— 這個更適合做 Cron 還是 HEARTBEAT.md 條目？
7. **去重** —— 你確定結果不會重複交付嗎？

做對這七點，你的定時 Agent 工作將是可靠的、可預測的、真正有用的。

---

## 總結

定時任務是把對話新奇感和生產力系統區分開來的關鍵。Harness 提供四種原語——One-Shot Timer、Recurring Cron、Event Trigger 和 Heartbeat——各適合不同的自動化形態。

架構選擇很重要：儲存 UTC，顯示本地時間。預設隔離 Session。設定超時。將交付繫結到發起頻道。將輕量檢查批次合併到 Heartbeat 而非生成多個 Cron。

一個按計劃、按自己的主動性行動、不需要被要求的 Agent——那不再是聊天機器人。那是基礎設施。
