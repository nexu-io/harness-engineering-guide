---
author: Nexu
---

# 多 Agent 編排

> **Core Insight:** 單個 Agent 會遇到硬性限制——Context Window 大小、領域專業化、序列執行。多 Agent 編排將工作分配給多個 Agent，每個 Agent 擁有獨立的 Context 和 Tool，通過借鑑分散式系統的模式進行協調。

[Sub-Agent](sub-agent.md) 一文介紹了最簡單的情況：一個主 Agent 生成多個 Worker 執行並行任務。本文更進一步——探討多個 Agent 協作、專業化和規模化的編排模式。

## 為什麼需要多 Agent？

單個 Agent 執行單個 Agentic Loop 是預設做法，對大多數任務都夠用。但三面牆最終會迫使你突破它：

### 1. Context Window 限制

即使有 200K Token 的視窗，複雜專案也可能耗盡可用 Context。一次涉及 80 個檔案的程式碼重構、一個需要消化 40 個文件的調研任務、一條不斷積累 Tool 輸出的多步流水線——都可能溢位單個視窗。當 Context 被填滿，Model 會開始遺忘早期指令，輸出品質下降。

多 Agent 分割工作。每個 Agent 獲得一個全新的 Context Window，專注於問題的一個切片。

### 2. 專業化

一個通用 Agent 同時寫程式碼、審 PR、生成營銷文案、做資料分析——每件事都做得平庸。當 Agent 的 System Prompt、Tool 和 Context 針對特定領域調優時，表現會好得多。一個載入了 Lint 工具和風格指南的 "Code Review Agent" 比一個碰巧也能呼叫 Linter 的通用 Agent 產出更好的審查結果。

### 3. 並行性

單個 Agent 是序列的。它呼叫一個 Tool，等結果，推理，再調下一個。當你有五個獨立任務——為五個模組寫測試、調研五個競品、翻譯成五種語言——單個 Agent 逐個處理，五個 Agent 同時處理。

## 編排模式

四種模式覆蓋了絕大多數多 Agent 架構。它們並非互斥——生產系統經常組合使用。

### Sequential Pipeline（順序流水線）

Agent A 完成工作，將輸出傳給 Agent B，再傳給 Agent C。每個 Agent 對結果進行轉換或增強。

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Ingest  │────►│ Analyze │────►│  Draft  │────►│ Review  │
│  Agent  │     │  Agent  │     │  Agent  │     │  Agent  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

**適用場景：** 具有自然階段的任務，每個階段需要不同的專業知識或工具。例如：抓取資料 → 清洗分析 → 生成報告 → 校對審查。

**關鍵特性：** 每個 Agent 只看到上一階段的輸出，而非全部累積的 Context。這是一個特性——它強制階段之間有清晰的介面，防止 Context 膨脹。

### Fan-Out / Fan-In（扇出/扇入）

一個協調者將相同（或相關）的任務並行分發給 N 個 Agent，然後收集合並所有結果。

```
                    ┌───────────┐
               ┌───►│ Worker A  │───┐
               │    └───────────┘   │
┌──────────┐   │    ┌───────────┐   │    ┌──────────┐
│Dispatcher│───┼───►│ Worker B  │───┼───►│  Merger  │
└──────────┘   │    └───────────┘   │    └──────────┘
               │    ┌───────────┐   │
               └───►│ Worker C  │───┘
                    └───────────┘
```

**適用場景：** 可分解為獨立、可並行子任務的工作。例如：將文件翻譯成 8 種語言、為 10 個模組寫單元測試、調研 5 個競品。

**關鍵特性：** Worker 之間零互動。Merger Agent（或 Dispatcher 本身）負責合併結果和解決衝突。

### Supervisor（監督者）

一個監督 Agent 做所有委派決策。它觀察當前狀態，決定下一步呼叫哪個專家，讀取結果，再決定下一步。與流水線不同，Supervisor 可以迴圈、重新委派、或根據中間結果多次呼叫同一個專家。

```
                 ┌─────────────────┐
                 │   Supervisor    │
                 │ (decides, loops)│
                 └───┬───┬───┬────┘
                     │   │   │
            ┌────────┘   │   └────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Code     │ │ Research │ │ Review   │
      │ Agent    │ │ Agent    │ │ Agent    │
      └──────────┘ └──────────┘ └──────────┘
```

**適用場景：** 下一步取決於上一步結果、且決定呼叫哪個專家需要判斷力的任務。例如：一個編碼 Supervisor 將實現委派給 Code Agent，將結果送給 Review Agent，如果 Review 發現問題就迴圈回 Code Agent。

**關鍵特性：** Supervisor 維護整體計劃和狀態。專家是無狀態的——接收任務，返回結果，然後遺忘。這保持了專家的 Context Window 乾淨。

### Peer-to-Peer（對等通訊）

Agent 之間直接通訊，沒有中央協調者。每個 Agent 有自己的收件箱，可以向任何其他 Agent 傳送訊息。

**適用場景：** 模擬、辯論式推理（Agent A 正方、Agent B 反方、Agent C 裁判），或 Agent 代表不同利益方的系統。

**關鍵特性：** 沒有單一的協調點。這使 Peer-to-Peer 成為最靈活的模式，但也最難除錯。沒有 Supervisor，很難保證終止或追蹤進度。

**警告：** 在生產 Harness 系統中，Peer-to-Peer 很少是正確選擇。缺乏中央控制使錯誤處理、超時執行和結果收集變得顯著更難。除非有特定原因需要去中心化通訊，否則優先使用 Supervisor 或 Fan-Out/Fan-In。

## 在 Harness 中實現

Harness（將 LLM 包裝成可工作 Agent 的宿主程式——參見[什麼是 Harness](what-is-harness.md)）通過四個機制實現多 Agent 編排：Sub-Agent 生成、Context 隔離、父讀子結果通訊、超時處理。

### Sub-Agent 生成

基礎原語是生成一個隔離的 Agent Session。在 OpenClaw 中，這是 `sessions_spawn` 模式：

```
Parent Agent
    │
    ├── sessions_spawn(label="research", task="調研競品定價")
    │       → 建立隔離 Session，擁有獨立的 Context、Tool、Model
    │
    ├── sessions_spawn(label="writer", task="撰寫定價頁面")
    │       → 另一個隔離 Session
    │
    └── 等待兩者完成（push-based）
```

每個生成的 Session 是一個完全獨立的 Agent，擁有自己的：
- Context Window（不與父 Agent 共享 Token 預算）
- System Prompt（可為每個 Sub-Agent 定製）
- Tool 集合（可限制或擴展）
- Model（可為簡單任務使用更便宜的 Model）

父 Agent 指定 Label、Task 描述，以及可選的 Model 或 Thinking 級別。Harness 處理程序生命週期、超時和結果交付。

### Context 隔離

Context 隔離不是便利功能——它是核心設計約束。每個 Sub-Agent 的 Context Window 完全獨立：

```
┌──────────────────────┐    ┌──────────────────────┐
│   Parent Context     │    │  Sub-Agent Context    │
│                      │    │                       │
│ [system prompt]      │    │ [system prompt]       │
│ [user conversation]  │    │ [task instruction]    │
│ [tool results A,B,C] │    │ [tool results X,Y]   │
│ [128K tokens used]   │    │ [12K tokens used]     │
│                      │    │                       │
│  無法看到 ──────────►│ X  │◄────── 無法看到       │
│  sub-agent context   │    │  parent context       │
└──────────────────────┘    └──────────────────────┘
```

**為什麼重要：** 一個已累積 128K Token 對話的父 Agent 可以生成一個從乾淨的 200K Token 預算開始的 Sub-Agent。Sub-Agent 不被無關歷史拖累——它只看到 Task 指令和父 Agent 顯式傳遞的 Context。

推論：Sub-Agent 無法讀取父 Agent 的變數、Tool 結果或對話歷史。所有資訊傳遞都是顯式的——父 Agent 將相關 Context 包含在 Task 指令字串中。

### 通訊：父讀子結果

Harness 中的多 Agent 通訊遵循嚴格模式：**父 Agent 讀取子結果；子 Agent 不向父 Agent 的記憶體寫入。**

```
1. 父 Agent 用 Task 指令生成子 Agent（單向寫入）
2. 子 Agent 獨立執行
3. 子 Agent 完成 → Harness 將結果推送給父 Agent（push-based）
4. 父 Agent 在下一輪 Agentic Loop 迭代中讀取結果
```

沒有共享記憶體，沒有訊息匯流排，沒有子 Agent 修改父 Agent 狀態的回撥機制。這個約束極大簡化了系統推理——父 Agent 始終是整體進度的唯一真相來源。

在 OpenClaw 中，完成是 **push-based** 的：當 Sub-Agent 完成時，結果自動在父 Session 中公佈。父 Agent 不需要輪詢。這消除了最常見的多 Agent Bug：緊密輪詢迴圈浪費 Token 檢查"完成了嗎？"

### 超時和錯誤處理

Sub-Agent 可能掛起、崩潰或產出垃圾。生產 Harness 必須處理所有三種情況：

```python
@dataclass
class SubAgentConfig:
    task: str
    label: str
    timeout_seconds: int = 300       # 5 分鐘後終止
    max_retries: int = 1             # 失敗重試一次
    fallback: str | None = None      # 多次失敗後的備選任務

class SubAgentManager:
    def spawn_with_safeguards(self, config: SubAgentConfig) -> str:
        for attempt in range(config.max_retries + 1):
            try:
                result = self.spawn(
                    task=config.task,
                    label=config.label,
                    timeout=config.timeout_seconds,
                )
                if self.validate_result(result):
                    return result
                config.task += "\n\n上次嘗試輸出無效。請更精確。"
            except TimeoutError:
                if attempt == config.max_retries and config.fallback:
                    return self.spawn(task=config.fallback, label=f"{config.label}-fallback")
                continue
            except Exception as e:
                log.error(f"Sub-agent {config.label} failed: {e}")
                if attempt == config.max_retries:
                    return f"[FAILED] {config.label}: {e}"
        return f"[FAILED] {config.label}: max retries exceeded"
```

**關鍵原則：**
- **始終設定超時。** 沒有超時的 Sub-Agent 是等待發生的資源洩漏。
- **驗證結果。** 輸出為空或包含錯誤資訊的 Sub-Agent 不算成功。
- **優雅降級。** 當 Sub-Agent 失敗時，父 Agent 應該用部分結果繼續，而非完全中止——除非失敗的任務是關鍵的。
- **限制深度。** Sub-Agent 生成自己的 Sub-Agent 會造成指數級複雜度。將遞迴限制在 1-2 層。

## 實際案例

三個開源專案展示了不同規模的多 Agent 編排。

### Multica（14K+ Star）

**模式：** Supervisor + Fan-Out / Fan-In

Multica 將 Agent 視為專案看板上的隊友。人類（或主 Agent）將 GitHub Issue 分配給 Agent Worker，每個獨立執行。系統在看板檢視上追蹤進度，顯示哪個 Agent 在做什麼、什麼在審查中、什麼已合併。

關鍵設計決策：
- **多 Runtime 支援** —— Agent 可以執行在 Claude Code、Codex、OpenClaw 或 OpenCode 上。編排器不關心 Worker 使用哪個 Runtime，只關心它產出預期輸出。
- **複合 Skill** —— Agent 可以組合多個 Skill（例如，一個 "fix-and-test" Agent 同時載入編碼 Skill 和測試 Skill）。
- **Issue 驅動委派** —— 工作圍繞 GitHub Issue 組織，而非抽象的"任務"。這給每個 Agent 一個具體、可追蹤的工作單元，有明確的驗收標準。

### Paseo（3.6K+ Star）

**模式：** Supervisor + 跨裝置執行

Paseo 提供統一介面與多個 Agent 互動。你發出命令，Paseo 將其路由到合適的 Agent——或扇出到多個 Agent 並行執行。

關鍵設計決策：
- **一個介面，多個 Agent** —— 使用者不需要知道哪個 Agent 處理哪個任務。Paseo 的路由層決定。
- **跨裝置** —— 同樣的編排在手機、桌面應用或 CLI 上都能工作。Agent 在服務端執行；介面只是一個薄客戶端。
- **預設並行** —— 當任務獨立時，Paseo 自動在可用 Agent 之間並行化，而非排隊。

### OpenClaw

**模式：** 原生 Sub-Agent 生成 + Push-based 完成

OpenClaw 將多 Agent 編排實現為一等 Harness 原語，通過 `sessions_spawn`。父 Agent 用一個 Tool 呼叫生成 Sub-Agent，指定 Label、Task 和可選的 Model/Thinking 配置。

關鍵設計決策：
- **Push-based 完成** —— 當 Sub-Agent 完成時，其結果自動在父 Session 中公佈。無需輪詢。
- **Label 追蹤** —— 每個 Sub-Agent 獲得人類可讀的 Label（如 `article-research`、`code-review`）。父 Agent 可以按 Label 列出、引導或終止 Sub-Agent。
- **深度限制** —— Sub-Agent 可配置最大深度，防止失控的遞迴生成。
- **Context 注入** —— 父 Agent 可以向 Sub-Agent 的 Session 注入特定 Context（檔案、指令、約束），而不共享完整對話歷史。

## 何時不該使用多 Agent

多 Agent 編排有實際成本：延遲增加（生成開銷）、Token 消耗更高（跨 Agent 重複的 System Prompt 和 Context）、除錯複雜度增加。以下情況應避免使用：

### 任務適合單個 Context Window

如果一個任務只需 10K Token 的 Context 和 5 次 Tool 呼叫，單個 Agent 比生成 Worker 更快更可靠。多 Agent 協調的開銷（生成、傳遞 Context、合併結果）超過了收益。

### 協調成本超過收益

需要兩個 Agent 緊密來回配合的任務——Agent A 需要 Agent B 的結果才能進行下一步，反之亦然——用單個 Agent 順序呼叫 Tool 更好。多 Agent 在工作*獨立*時發光；在工作深度交織時受限。

### 需要嚴格順序

如果步驟必須按精確順序執行並精確交接，且沒有並行機會，那麼帶有逐步計劃的單個 Agent 更簡單、更確定性。Agent 順序流水線在每個階段邊界增加延遲但沒有並行收益——僅在階段確實受益於 Context 隔離或專業化時使用。

## 反模式

### 共享可變狀態

兩個 Agent 同時寫入同一檔案、資料庫行或變數。這會產生競態條件、覆蓋工作和不確定性結果。解決方案：為每個 Agent 分配獨立的資源所有權。如果兩個 Agent 必須貢獻到同一產出物，使用 Fan-Out/Fan-In 模式，由 Merger Agent 順序合併它們的輸出。

### 無界扇出

按輸入大小比例生成 Agent 而不設上限。"將這個文件翻譯成所有 50 種支援的語言" 會生成 50 個同時執行的 Agent，壓垮系統。解決方案：設定 `max_workers` 限制並分批處理。

```python
# 錯誤：無界
for lang in all_50_languages:
    spawn_agent(task=f"Translate to {lang}")

# 正確：分批限制
BATCH_SIZE = 8
for batch in chunked(all_50_languages, BATCH_SIZE):
    results = fan_out_fan_in(
        [f"Translate to {lang}" for lang in batch],
        merge_prompt="Collect all translations.",
    )
```

### 無超時或斷路器

Sub-Agent 掛起——等待限速的 API、陷入無限迴圈、或只是運行復雜任務——如果沒有超時，會阻塞整個編排。每次 Sub-Agent 生成必須包含：
- **超時** —— 在最大時長後終止 Agent
- **斷路器** —— N 次失敗後停止重試
- **降級路徑** —— 允許父 Agent 用部分結果繼續

### 過度分解

將 30 秒的任務拆成 5 個 Sub-Agent，每個需要 15 秒的生成和返回開銷。總耗時從 30 秒增加到 75 秒。多 Agent 是管理複雜度和並行性的工具——不是每個任務的預設選擇。

## 選擇正確的模式

| 場景 | 模式 | 原因 |
|------|------|------|
| 具有不同專業知識的階段 | Sequential Pipeline | 每個階段獲得專業化的 Context 和 Tool |
| N 個獨立的相同任務 | Fan-Out / Fan-In | 最大並行性，簡單合併 |
| 需要判斷下一步的複雜任務 | Supervisor | 中央決策，靈活路由 |
| 辯論或多視角分析 | Peer-to-Peer | Agent 代表不同觀點 |
| 並行與順序工作混合 | Supervisor + Fan-Out | Supervisor 決定何時並行化 |

從最簡單的有效模式開始。單個 Agent 加上好的 Tool 使用能處理 80% 的任務。當你遇到[為什麼需要多 Agent？](#為什麼需要多-agent)中描述的限制時，選擇解決特定瓶頸的最輕量編排模式。[Sub-Agent](sub-agent.md) 一文介紹了最簡單的委派模式——在構建完整編排層之前先從那裡開始。

## 延伸閱讀

- [Sub-Agent](sub-agent.md) — 單主多從的基礎委派模式
- [Agentic Loop](agentic-loop.md) — 每個 Agent 內部執行的核心執行迴圈
- [Context 工程](context-engineering.md) — 管理每個 Agent 的 Context Window 中放什麼
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — 多 Agent 協調模式
- [OpenAI: Agents SDK — Multi-Agent](https://openai.github.io/openai-agents-python/) — Handoff 和編排原語
- [Microsoft AutoGen](https://microsoft.github.io/autogen/) — 多 Agent 對話模式框架
