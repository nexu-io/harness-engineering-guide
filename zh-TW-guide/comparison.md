---
author: Nexu
---

# 主流 Harness 實現對比

這是截至 2025 年中主要 Agent Harness 的事實性對比。這個領域發展很快——具體細節可能變化，但架構模式是穩定的。

## 總覽表

| 專案 | Context 管理 | Memory | Skill / Tool | 多 Agent | 開源 |
|---|---|---|---|---|---|
| **OpenClaw** | AGENTS.md 驅動的 Context 注入。每個 Session 載入工作區檔案、Skill 和 Memory。通過摘要進行 Context 壓縮。 | 基於檔案：MEMORY.md（長期）、日誌（memory/YYYY-MM-DD.md）、wiki/ 用於結構化知識。完全可移植。 | Skill 系統：每個 Skill 是 SKILL.md + 支援檔案。可從 ClawdHub 安裝。支援 MCP 協議。 | Sub-Agent spawn，推送式完成通知。編排器委派任務，結果自動上報。 | ✅ 開源 |
| **Claude Code** | 512K Context Window。按需通過 read Tool 載入檔案。CLAUDE.md 用於專案級指令。Context 滿時壓縮舊訊息。 | 基於 Session。預設無跨 Session 持久 Memory。CLAUDE.md 提供專案連續性。使用者自管理檔案。 | 內建 Tool：read、write、edit、exec、web search。可通過 MCP Server 擴展。權限系統（allow/deny/ask）。 | 單 Agent。無原生 Sub-Agent 支援。可通過 exec 呼叫其他 CLI 工具。 | ✅ 開源 |
| **Codex (OpenAI CLI)** | 載入倉庫結構 + 相關檔案。AGENTS.md 用於指令。Sandbox 化執行環境。 | 無持久 Memory。讀取專案檔案（README、AGENTS.md）獲取 Context。每次執行 Session 狀態重置。 | 內建：檔案讀寫、exec、web search。預設在禁網 Sandbox 中執行。可按 Session 啟用網路。 | 單 Agent。無多 Agent 編排。設計用於單任務執行。 | ✅ 開源 |
| **Cline** | VS Code 擴展。載入開啟的檔案 + 相關工作區檔案。自訂指令檔案。滑動視窗管理 Context。 | 無內建持久 Memory。依賴工作區檔案和 VS Code Session 內的對話歷史。 | 檔案操作、終端命令、瀏覽器自動化。支援 MCP Server 擴展。操作審批工作流。 | 單 Agent。無多 Agent 支援。通過 VS Code 審批提示實現人在迴路。 | ✅ 開源 |
| **Aider** | Git 感知 Context。通過 /add 顯式新增檔案到 Context。Repo map 提供專案全域性概覽。基於 diff 編輯。 | Git 歷史作為隱式 Memory。無專用 Memory 系統。Session 歷史在終端 Session 內持續。 | 聚焦的 Tool 集：檔案編輯（diff 格式）、Git 操作、lint、測試。無外掛系統。 | 單 Agent。無多 Agent。設計用於結對程式設計（人 + 一個 Agent）。 | ✅ 開源 |
| **Cursor** | IDE 整合。全倉庫嵌入索引。基於語義搜尋載入相關檔案。@-mention 用於顯式 Context。 | 無持久 Agent Memory。程式碼庫索引作為隱式知識。.cursorrules 用於專案配置。 | 程式碼編輯、終端、檔案操作、文件查閱。整合偵錯程式 Context。無外掛市場。 | 單 Agent。無多 Agent。後臺索引是非同步的但非 Agent 化。 | ❌ 閉源 |
| **Nexu** | Agent 原生 IM 平臺。每個 Agent 有工作區：AGENTS.md、SOUL.md、USER.md、MEMORY.md。Skill 注入專業 Context。 | 完整體系：MEMORY.md（策展式長期）、日誌、wiki/ 知識庫、TOOLS.md（環境專屬筆記）。跨 Session 連續性是設計核心。 | Skill 市場。每個 Skill 自包含，帶 SKILL.md 指令。平臺級 Tool：日曆、郵件、訊息、瀏覽器、攝像頭、節點。 | 多 Agent 原生。Sub-Agent spawn、跨頻道訊息、cron 排程。Agent 可跨 IM 頻道協作。 | ❌ 閉源（平臺） |

## 深入對比：關鍵差異

### Context 策略

各 Harness 如何決定給模型看什麼：

```
Aider          : 顯式 — 使用者手動新增檔案 (/add, /drop)
Claude Code    : 按需 — Agent 按需讀取檔案
Cursor         : 語義 — 嵌入索引，自動檢索相關程式碼
OpenClaw/Nexu  : 配置驅動 — AGENTS.md 宣告載入什麼
Codex          : 倉庫感知 — 掃描結構，載入相關檔案
Cline          : IDE 感知 — 開啟的標籤頁 + 工作區檔案
```

**權衡：** 顯式控制（Aider）精確但需要使用者操作。語義檢索（Cursor）自動但可能遺漏或包含錯誤檔案。配置驅動（OpenClaw）可預測但需要前期配置。

### Memory 架構

```python
# 型別 1: 無 Memory (Claude Code, Codex, Cursor, Cline)
# 每個 Session 從零開始。Context 來自專案檔案。
context = load_project_files()  # That's it

# 型別 2: 基於檔案的 Memory (OpenClaw, Nexu)
# 跨 Session 的持久知識，使用者可編輯。
context = (
    load_project_files()
    + load_memory("MEMORY.md")
    + load_daily_log(today)
    + load_wiki_if_relevant(task)
)

# 型別 3: 嵌入式 Memory（閉源平臺）
# 儲存在向量資料庫中，按相似度檢索。
context = (
    load_project_files()
    + vector_search(task, memory_store)
)
```

### Tool 可擴展性

| 方式 | 專案 | 優點 | 缺點 |
|---|---|---|---|
| **MCP 協議** | OpenClaw、Claude Code、Cline | 標準協議，可互操作 | Server 配置開銷 |
| **Skill 檔案** | OpenClaw、Nexu | 自包含、可分享、有市場 | 自訂格式 |
| **僅內建** | Aider、Codex | 簡單、可預測 | 擴展性有限 |
| **IDE 整合** | Cursor、Cline | 豐富的編輯器 Context | 繫結 IDE |

### 多 Agent 模式

大多數 Harness 是單 Agent 的。多 Agent 支援差異很大：

```python
# OpenClaw/Nexu: 一等公民的 Sub-Agent spawn
subagent = spawn(
    task="Research competitor pricing",
    model="gpt-4o",
    tools=["web_search", "web_fetch"],
)
# Result auto-announces when done — no polling needed

# Claude Code: 通過 exec 間接實現多 Agent
result = exec("claude-code --print 'Review this PR'")
# Works but no structured communication

# Others: 無原生多 Agent
# Workaround: multiple terminal sessions, manual coordination
```

## 如何選擇合適的 Harness

| 如果你需要... | 考慮 |
|---|---|
| 深度程式碼編輯 + IDE 整合 | **Cursor** 或 **Cline** |
| 終端編碼 Agent | **Claude Code** 或 **Aider** |
| Sandbox 化任務執行 | **Codex** |
| 多 Agent 編排 | **OpenClaw** 或 **Nexu** |
| 跨 Session 持久 Memory | **OpenClaw** 或 **Nexu** |
| 可擴展的 Tool 生態 | **OpenClaw**（Skill + MCP） |
| 最小配置、開箱即用 | **Aider** |

## 表格沒有展示的

- **模型支援** —— 大多數 Harness 不繫結模型（OpenClaw、Cline、Aider 支援多家供應商）。Codex 僅支援 OpenAI。Claude Code 以 Anthropic 為主。
- **成本** —— 差異很大，取決於模型選擇、Context 大小和任務複雜度。不是 Harness 特性，而是使用模式。
- **速度** —— 更多取決於模型延遲而非 Harness 架構。流式支援是通用的。
- **社群** —— 開源專案（Aider、Claude Code、Cline、OpenClaw）都有活躍社群。社群大小不等於品質。

## 常見陷阱

- **跟風選擇** —— 選適合你工作流的 Harness，不是 GitHub star 最多的。
- **忽視 Memory** —— 如果你的任務跨 Session，沒有持久 Memory 的 Harness 意味著每次都要重新解釋 Context。
- **認為"開源"等於"免費"** —— Harness 是免費的；模型 API 呼叫不是。做好 API 成本預算。

## 延伸閱讀

- [術語表 →](/guide/glossary) — 本指南使用的核心術語
