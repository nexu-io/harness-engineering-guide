---
author: Nexu
---

# 術語表

Harness Engineering指南中使用的核心術語，用直白語言定義。

---

**Harness**
包裹 AI 模型並將其變成可用 Agent 的程式碼。它管理 Tool 迴圈、Context、Memory 和決策流程。沒有 Harness，你有的是聊天機器人；有了 Harness，你有的是 Agent。

**Runtime**
Harness 執行的執行環境。包括作業系統、檔案系統、網路訪問和 Sandbox。Runtime 決定了 Agent 在物理上*能做什麼*——Harness 決定了它*選擇做什麼*。

**Framework**
用於構建 Harness 的庫或 SDK。Framework 提供抽象（Tool 註冊表、Memory 儲存、Prompt 模板），讓你不用從零開始。例如：LangChain、CrewAI、AutoGen。Framework 是工具包；Harness 是成品。

**Context Window**
模型在單次請求中能處理的最大文本量（以 Token 計量）。前沿模型通常為 128K–200K Token。Agent 在一輪中"知道"的所有東西——指令、Memory、對話歷史、檔案內容——都必須裝進這個視窗。

**Tool Loop**
Agent 的核心執行迴圈：呼叫模型 → 模型請求 Tool → 執行 Tool → 把結果喂回去 → 重複。迴圈持續到模型產出最終文本回復且不再呼叫 Tool。每個 Harness 都實現了這個迴圈的某個變體。

**Skill**
一個自包含的能力包，擴展 Agent 的能力。由 SKILL.md 指令檔案加任何支援程式碼或模板組成。Skill 是"薄 Harness、厚 Skill"模式中"厚"的部分——它們編碼了領域知識，讓 Harness 保持通用。

**AGENTS.md**
定義 Agent 在某個工作區中應如何行為的配置檔案。包含指令、慣例、Tool 使用指南和工作流定義。Harness 在每個 Session 開始時讀取它。在支援該慣例的 Harness 實現之間可移植。

**MEMORY.md**
基於檔案的長期 Memory 儲存。包含 Agent 跨 Session 需要的策展知識：使用者偏好、專案細節、經驗教訓。與閉源 Memory 系統不同，MEMORY.md 是人類可讀、可編輯、可移植的。

**ReAct (Reasoning + Acting)**
一種 Prompt 模式，模型在思考（"我應該搜尋 X"）和行動（呼叫 Tool）之間交替。產生 Thought → Action → Observation 迴圈。大多數現代 Agent Harness 實現了 ReAct 的變體，通常通過 Tool Loop 隱式實現。

**Chain-of-Thought (CoT)**
一種 Prompt 技術，鼓勵模型在產出最終答案前"逐步思考"。擴展思維（如 Claude 的 thinking 模式）是這種技術在模型層面的實現——模型在回覆前生成內部推理 Token。

**HaaS (Harness as a Service)**
將 Agent Harness 部署為託管雲服務的模式。API 閘道器將請求路由到 Session 管理器，Session 管理器分發到執行在 Sandbox 環境中的 Harness Worker。實現多租戶 Agent 託管，具備 Session 隔離和資源限制。

**薄 Harness**
一種設計哲學，Harness 本身最小化——只有 Tool Loop、Context 管理和 Session 編排——而領域特定邏輯放在 Skill 中。Harness 是通用引擎；Skill 提供專業知識。與單體式 Agent 架構相對。

**厚 Skill**
"薄 Harness"的對應面。Skill 包含特定任務的詳細指令、示例和工作流。一個用於郵件的厚 Skill 可能包含模板、語氣指南和平臺特定的格式規則。Skill 是領域知識的所在地。

**多 Agent**
多個 AI Agent 協作完成任務的架構。Agent 可能有不同角色（調研員、寫手、審閱者）、不同模型或不同 Tool 集。需要編排——決定哪個 Agent 做什麼，以及它們如何通訊。

**Sub-Agent**
由另一個 Agent spawn 來處理特定子任務的 Agent。父 Agent 委派工作，在 Sub-Agent 完成後接收結果。Sub-Agent 有隔離的 Session，但可能共享 Memory 或工作區訪問。分解複雜任務的核心模式。

**Sandbox**
用於安全執行 Agent Tool 呼叫的隔離執行環境。通常是受限檔案系統、網路和程序訪問的容器或虛擬機器。防止 Agent 意外（或惡意）影響宿主系統。對程式碼執行 Tool 來說是必需的。

**Context 壓縮**
將更多資訊裝進固定 Context Window 的技術。包括摘要舊訊息、移除冗餘內容、截斷大的 Tool 輸出、以及選擇性地只加載相關檔案。當對話歷史超過 Context 限制時至關重要。

**Token 預算**
將 Context Window 分配到不同用途的策略：System Prompt、Memory、對話歷史、Tool 結果和模型輸出。設計良好的 Token 預算確保最重要的資訊獲得優先權。例如：20% 給 System Prompt、15% 給 Memory、50% 給歷史、15% 給回覆。

**Session**
使用者和 Agent 之間的一次持續互動。Session 有開始（使用者傳送第一條訊息）、中間（來回的 Tool 呼叫）和結束（使用者離開或 Session 超時）。Session 狀態包括對話歷史、活躍 Tool 和任何積累的 Context。

**Checkpoint**
在 Session 中某個特定時刻儲存的 Agent 狀態快照。包括對話歷史、Tool 狀態和任何中間結果。可以在崩潰或暫停後恢復而無需從零開始。對於中途失敗代價高昂的長時間執行任務至關重要。

**MCP (Model Context Protocol)**
連線 AI 模型與外部 Tool 和資料來源的開放協議。定義了標準介面，使 Tool（MCP Server）可被任何相容的 Harness（MCP Client）使用。旨在解決 N×M 整合問題——不需要每個 Harness 都與每個 Tool 對接，雙方都說 MCP。

**Eval（評估）**
根據定義標準衡量 Agent 效能的過程。包括行為測試（Agent 是否呼叫了正確的 Tool？）、結果測試（結果是否正確？）和經濟測試（花了多少錢？）。Eval 之於 Agent 就像單元測試之於程式碼——在生產中不是可選項。

**Trace**
Agent Session 的完整記錄：每條傳送的訊息、每次 Tool 呼叫、每個接收的結果和最終輸出。Trace 用於除錯（哪裡出了問題？）、評估（Agent 表現如何？）和迴歸測試（新版本是否更差了？）。Agent 世界的日誌檔案。

---

