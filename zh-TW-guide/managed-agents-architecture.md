---
author: Nexu
---

# 託管 Agent：將大腦與雙手解耦

> **Core Insight:** 單體 Agent 容器——Harness、Sandbox 和 Session 狀態共享一個程序——是一隻你丟不起的寵物。將大腦（Harness + LLM）與雙手（Sandbox + Tool）以及 Session（事件日誌）解耦，使每個元件變成可替換的"牲畜"，從而解鎖獨立擴展、故障恢復和安全隔離。

## 單體問題

最簡單的 Agent 架構把一切放在一個盒子裡：

```
┌──────────────────────────────────┐
│         單一容器                  │
│                                   │
│  ┌─────────┐  ┌──────────────┐   │
│  │ Harness  │  │   Sandbox    │   │
│  │ (大腦)   │  │ (程式碼執行)   │   │
│  │          │  │              │   │
│  │ Session  │  │ 憑證         │   │
│  │ 狀態     │  │ 使用者檔案     │   │
│  └─────────┘  └──────────────┘   │
│                                   │
└──────────────────────────────────┘
```

這對原型可以。在生產環境中，它會以三種可預見的方式失敗。

### 失敗 1：寵物問題

在 [寵物 vs. 牲畜](https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/) 的類比中，寵物是一臺有名字、精心照料、丟不起的伺服器。牲畜是可互換的——一隻死了，你換一隻。

單體 Agent 容器就是寵物。如果容器崩潰，Session 就丟了。如果它無響應，你必須把它"救活"。你不能直接殺掉它再啟一個新的，因為 Session 狀態——Agent 做過的一切的完整歷史——就在裡面。

### 失敗 2：除錯盲區

當單體容器卡住時，你唯一的視窗是外部事件流。但 Harness 的 bug、丟失的網路包和崩潰的容器，從外面看起來都一樣。要診斷真正的原因，工程師需要進入容器內部的 shell 訪問——但那個容器也儲存著使用者資料和憑證。除錯變成了一起安全事件。

### 失敗 3：安全邊界

Agent 生成的不可信程式碼與憑證執行在同一個容器中。提示注入只需說服 Agent 讀取自己的環境變數。一旦攻擊者拿到這些 Token，他們就能發起不受限制的 Session。縮小權限範圍有幫助，但它建立在對模型用有限 Token 做不了什麼的假設之上——而模型一直在變得更聰明。

## 三層架構

解決方案是將單體分解為三個獨立層，每層有自己的生命週期：

```
┌─────────────────────────────────────────────────────────┐
│                    編排層                                 │
│                                                          │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │    大腦       │  │ Session  │  │      雙手          │  │
│  │  (Harness +   │  │ (事件    │  │  (Sandbox A)      │  │
│  │   LLM 呼叫)   │  │  日誌)   │  │  (Sandbox B)      │  │
│  │              │  │          │  │  (MCP Tool)       │  │
│  │  無狀態      │  │ 持久化   │  │  可丟棄           │  │
│  └──────┬───────┘  └────┬─────┘  └────────┬──────────┘  │
│         │               │                  │             │
│         │  emitEvent()  │   execute()      │             │
│         ├──────────────►│◄─────────────────┤             │
│         │  getEvents()  │   provision()    │             │
│         ├──────────────►│                  │             │
│         └───────────────┴──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 大腦（Harness）

Harness 執行 Agent 迴圈：呼叫 LLM、路由 Tool 呼叫、管理上下文。關鍵的是，Harness 是**無狀態的**。它不在記憶體中儲存任何 Session 資料。所有持久化內容通過 `emitEvent()` 寫入 Session 日誌。

當 Harness 崩潰時，一個新的 Harness 啟動，呼叫 `wake(sessionId)`，通過 `getEvents()` 獲取事件日誌，從最後一個事件恢復。沒有資料丟失。不需要"搶救"。Harness 變成了牲畜。

### Session（事件日誌）

Session 是一個**僅追加日誌**，記錄了發生的一切：LLM 呼叫、Tool 結果、使用者訊息、系統事件。它存在於 Harness 和 Sandbox 之外的持久儲存中。

關鍵介面：
- `emitEvent(sessionId, event)` — 在 Agent 迴圈中寫入事件
- `getEvents(sessionId, options)` — 讀回事件（位置切片、過濾）
- `getSession(sessionId)` — 獲取後設資料和狀態

Session 的生命週期超越 Harness 和 Sandbox。如果任一崩潰，Session 保持完整。

### 雙手（Sandbox）

Sandbox 是執行環境，Agent 在其中執行程式碼、編輯檔案、執行命令。它們按需通過 `provision({resources})` 建立，不再需要時銷燬。

Harness 呼叫 Sandbox 的方式與呼叫任何 Tool 相同：`execute(name, input) → string`。如果 Sandbox 掛了，Harness 將錯誤作為失敗的 Tool 呼叫捕獲並傳遞給 LLM。模型可以決定在新的 Sandbox 上重試。

## Session ≠ Context Window

這個區分是架構中最微妙也最重要的部分。

**Session** 是完整的持久記錄——可能跨越數小時或數天的 Agent 工作，包含數百萬 Token。**Context Window** 是 Harness 為當前 LLM 呼叫選取的該記錄的子集——通常是 128K-200K Token。

```
Session（僅追加事件日誌，持久化）
┌─────────────────────────────────────────────────────────────┐
│ event_1 │ event_2 │ ... │ event_500 │ ... │ event_2000     │
└─────────────────────────────────────────────────────────────┘
                                    │
                          getEvents(slice)
                                    │
                                    ▼
                    Context Window（選取的子集）
                    ┌───────────────────────────┐
                    │ system_prompt             │
                    │ event_1950 ... event_2000 │
                    │ (最近 50 個事件)           │
                    └───────────────────────────┘
```

這種分離有三個好處：

**1. 不可逆決策變為可逆。** 壓縮（總結舊上下文以騰出空間）會永久性地銷燬資訊。有了持久化的 Session 日誌，Harness 可以重新讀取任何過去的事件——即使那些之前已從 Context Window 中壓縮掉的。如果後續輪次需要 event_200 的資訊，Harness 可以去取。

**2. 上下文工程成為 Harness 的職責。** Harness 決定什麼進入 Context Window：最近的事件、舊事件的摘要、系統提示、相關檔案內容。不同的 Harness 實現可以使用不同的策略，而無需更改 Session 格式。今天的上下文工程可能是 Token 級別的裁剪；明天可能是語義檢索。Session 保持不變。

**3. 多大腦架構成為可能。** 多個 Harness 可以同時讀取同一個 Session 日誌。規劃大腦可以審查完整歷史，而執行大腦專注於最近的事件。兩者從同一個持久化來源讀取。

## 安全：憑證絕不進入 Sandbox

解耦架構建立了天然的安全邊界。憑證存在於 Sandbox 之外的保險庫中。Agent 從不直接處理 Token。

兩種模式：

**隨資源捆綁：** 對於 Git，訪問 Token 在 Sandbox 初始化期間用於克隆倉庫和配置本地遠端。`git push` 和 `git pull` 在 Sandbox 內部即可工作，Agent 永遠看不到 Token。

**保險庫 + 代理：** 對於外部 API（通過 MCP），OAuth Token 存在安全保險庫中。Agent 通過代理呼叫 MCP Tool。代理從保險庫中查詢 Session 的憑證併發起外部呼叫。Sandbox 永遠看不到憑證。

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│  Agent    │────►│  MCP      │────►│  保險庫    │────►│ 外部     │
│ (sandbox) │     │  代理     │     │ (金鑰)    │     │ 服務     │
│           │     │           │     │           │     │          │
│ 此處無    │     │ Session   │     │ OAuth     │     │          │
│ 憑證      │     │ → 憑證   │     │ Token     │     │          │
└───────────┘     └───────────┘     └───────────┘     └──────────┘
```

即使提示注入說服 Agent 搜尋整個環境，也找不到任何憑證。

## 效能：TTFT 改進

在單體設計中，每個 Session——即使是從未用到 Sandbox 的——都要付出完整的容器啟動成本：克隆倉庫、啟動程序、獲取事件。推理要等容器準備好才能開始。

在解耦架構中，Harness 立即啟動。Sandbox 配置通過 Tool 呼叫延遲發生，僅在需要時進行。來自 Anthropic 生產部署的結果：

| 指標 | 單體 | 解耦 | 提升 |
|------|------|------|------|
| TTFT p50 | 基準 | ~基準的 40% | **~60% 降低** |
| TTFT p95 | 基準 | ~基準的 10% | **~90% 降低** |

p95 的改進尤為顯著，因為最壞情況下的容器啟動（冷拉取、慢磁碟）被完全從不需要 Sandbox 的 Session 的關鍵路徑中移除了。

## 多大腦，多雙手

該架構在兩個維度上自然擴展。

### 擴展大腦

擴展到大量併發 Agent Session 意味著啟動大量無狀態 Harness。由於每個 Harness 不儲存狀態（所有持久化內容在 Session 日誌中），水平擴展非常簡單。沒有共享記憶體、沒有分散式鎖、沒有狀態同步。

### 擴展雙手

單個大腦可以連線多個 Sandbox。實際上，這意味著 Agent 對多個執行環境進行推理，並決定將工作傳送到哪裡：

```
┌──────────┐
│  大腦     │
│ (harness)│
└────┬─────┘
     │
     ├──► Sandbox A（Python 環境）
     ├──► Sandbox B（Node.js 環境）
     ├──► Sandbox C（客戶 VPC）
     └──► MCP Tool Server（外部 API）
```

早期模型做不到這一點——同時對多個執行環境進行推理太複雜了。隨著模型能力的提升，單容器假設變成了瓶頸。解耦架構已經為模型的能力追上來做好了準備。

### 客戶 VPC 整合

當一切執行在一個容器中時，連線到客戶的基礎設施意味著網路對等——客戶的 VPC 必須從我們的容器可達。在解耦架構中，Sandbox 可以執行在客戶的 VPC 內部，而大腦執行在我們的基礎設施上。大腦通過標準的 `execute()` 介面與 Sandbox 通訊，無論 Sandbox 實際執行在哪裡。

## 反模式

### 在 Harness 中儲存 Session 狀態

```python
# ❌ Session 狀態在 Harness 記憶體中
class HarnessWithState:
    def __init__(self):
        self.events = []  # Harness 崩潰就丟了
        self.current_plan = None
    
    def run_turn(self, message):
        result = self.llm.call(self.events + [message])
        self.events.append(result)  # 只在記憶體中
```

如果 Harness 崩潰，一切都沒了。始終將事件發射到持久化的 Session 日誌。

```python
# ✅ Session 狀態外接
class StatelessHarness:
    def run_turn(self, session_id, message):
        events = self.session_store.get_events(session_id)
        result = self.llm.call(events + [message])
        self.session_store.emit(session_id, result)  # 持久化
```

### 憑證進入 Sandbox

```python
# ❌ 將 API 金鑰傳入 Sandbox 環境
sandbox.execute("export GITHUB_TOKEN=ghp_xxx && git push")
```

距離被竊取只差一次提示注入。改用保險庫 + 代理模式。

### 急切的 Sandbox 配置

```python
# ❌ 在不知道是否需要之前就配置 Sandbox
sandbox = provision_sandbox(resources=large_config)  # 30 秒啟動
result = llm.call(prompt)  # 可能根本不需要 Sandbox
```

延遲配置。讓 LLM 通過 Tool 呼叫決定是否需要 Sandbox，以及需要哪種。

## 設計清單

在構建託管 Agent 架構之前：

1. **大腦無狀態性** — Harness 能否崩潰後重啟而不丟失資料？
2. **Session 永續性** — 事件日誌是否儲存在大腦和雙手之外？
3. **Sandbox 可丟棄性** — 任何 Sandbox 能否被終止和替換？
4. **憑證隔離** — 金鑰是否從 Sandbox 中不可訪問？
5. **延遲配置** — Sandbox 是否按需建立，而非預先配置？
6. **介面穩定性** — 大腦↔雙手的介面是否通用到足以超越當前實現？

## 總結

單體 Agent 容器是自然的起點——把一切放在一個盒子裡很簡單。但它建立了不可替換的寵物、無法執行的安全邊界和無法消除的效能瓶頸。

分解為三層——無狀態大腦、持久化 Session、可丟棄雙手——解決了這三個問題。大腦變成了牲畜（崩潰後重啟）。Session 成為唯一的真實來源（比一切都長壽）。雙手變成了按需資源（需要時配置，完成後銷燬）。

這與作業系統幾十年前發現的模式相同：虛擬化元件，保持介面穩定，讓底層實現自由變化。`read()` 系統呼叫不關心它是從 1970 年代的磁碟包還是現代 SSD 讀取。`execute()` 介面不關心 Sandbox 執行在本地、客戶的 VPC 還是另一個大洲。

## 延伸閱讀

- [Sub-Agent](sub-agent.md) — 派生具有獨立生命週期的隔離 Agent
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — 協調多個大腦的模式
- [Sandbox](sandbox.md) — 執行環境隔離與安全
- [Scheduling & Automation](scheduling-and-automation.md) — 長時執行週期性工作的 Session 定向
- [Anthropic: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) — 原始架構文章
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — 基礎 Agent 設計模式
