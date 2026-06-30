---
author: Nexu
---

# Memory 與 Context

> **Core Insight:** 模型只知道 Context 視窗中的內容。Memory 是連線模型*需要知道的*和它在單次 API 呼叫中*能看到的*之間的橋樑。把這件事做對，是 Harness Engineering中槓桿最高的問題。

## 三個不同的概念

這些術語經常被混淆，但它們有不同的用途：

| 概念 | 範圍 | 永續性 | 示例 |
|---------|-------|-------------|---------|
| **Context** | 單次 API 呼叫 | 無——每輪重建 | 系統提示 + Tool + 最近訊息 + 相關檔案 |
| **Session** | 單次對話或任務 | 記憶體中，重啟即丟失 | 訊息歷史、Tool 呼叫結果、工作狀態 |
| **Memory** | 跨 Session，無限期 | 寫入磁碟 | MEMORY.md、每日日誌、學習到的偏好 |

**Context** 是模型的"工作記憶"——組裝進單次 prompt 的所有內容。**Session** 是一次進行中的互動狀態。**Memory** 是 Session 結束後留存下來的東西。

## Context 組裝

Agentic Loop 的每一輪都從組裝 Context 開始。這是一個有優先順序的裝箱問題——你有固定的 Token 預算，必須決定放什麼進去：

```
Context 視窗（如 128K Token）
┌─────────────────────────────────┐
│  System Prompt        (~500)    │  ← 始終包含，最高優先順序
│  Tool Schemas         (~2000)   │  ← 僅活躍 Tool
│  Memory Summary       (~1000)   │  ← 壓縮的長期 Memory
│  Relevant Files       (~5000)   │  ← 任務相關 Context
│  Conversation History (~varies) │  ← 隨時間增長，需要裁剪
│  [Remaining Budget]             │  ← 可用於新內容
└─────────────────────────────────┘
```

優先順序系統決定空間緊張時包含什麼：

```python
class ContextAssembler:
    def __init__(self, max_tokens: int = 128_000):
        self.max_tokens = max_tokens
        self.sections = []  # (priority, name, content)

    def add(self, priority: int, name: str, content: str):
        self.sections.append((priority, name, content))

    def build(self) -> list[dict]:
        # Sort by priority (lower = higher priority)
        self.sections.sort(key=lambda x: x[0])
        messages = []
        used_tokens = 0
        for priority, name, content in self.sections:
            token_count = estimate_tokens(content)
            if used_tokens + token_count > self.max_tokens:
                break  # Budget exceeded — skip lower-priority content
            messages.append({"role": "system", "content": f"[{name}]\n{content}"})
            used_tokens += token_count
        return messages
```

## Session 管理

Session 是單次 Agent 執行的邊界，包含：

- **訊息歷史** —— 完整對話，包括 Tool 呼叫和結果
- **工作狀態** —— 哪些檔案打開了、載入了哪些 Skill、當前任務進度
- **臨時空間** —— Agent 生成但尚未提交的臨時資料

Session 設計的關鍵選擇是**什麼時候清除它**。幾種方案：

| 策略 | 行為 | 適用場景 |
|----------|----------|----------|
| **按任務** | 每個使用者請求新開 Session | 無狀態助手 |
| **按對話** | Session 在一次聊天的多輪中保持 | 互動式編碼 |
| **持久化** | Session 在程序重啟後仍存活 | 長期執行的後臺 Agent |

持久化 Session 需要序列化——將 Session 狀態寫入磁碟以便恢復。這是 Session 和 Memory 重疊的地方：任何值得在重啟後保留的內容，都應該寫入 Memory 檔案而非儲存在 Session 狀態中。

## Memory 架構

經過驗證的 Memory 架構採用兩級結構：

### 第一級：每日日誌

原始的、按時間順序的事件記錄。在 Session 中寫入，不做精選：

```markdown
<!-- memory/2026-04-15.md -->
# 2026-04-15

## 14:30 — Refactored auth module
- Moved JWT validation from middleware to dedicated service
- Tests passing (23/23)
- User prefers explicit error messages over error codes

## 16:00 — Deploy to staging
- Used blue-green deployment
- Rollback plan: revert commit abc123
```

### 第二級：長期 Memory

精選過的、提煉出的知識。定期更新（不是每個 Session）：

```markdown
<!-- MEMORY.md -->
# Long-term Memory

## User Preferences
- Prefers explicit error messages over error codes
- Uses pytest, not unittest
- Deploy strategy: blue-green with rollback plan

## Project Knowledge
- Auth module: JWT validation in /src/services/auth.py
- Database: PostgreSQL 15, migrations in /db/migrations/
- CI: GitHub Actions, ~3min build time

## Lessons Learned
- Always run tests before committing (broke build on 4/10)
- User dislikes verbose output — keep summaries under 5 lines
```

關鍵洞察：每日日誌寫起來成本很低（追加就行）。長期 Memory 需要判斷力（什麼值得保留？）。生產級 Harness 自動寫每日日誌，定期整理 MEMORY.md——按計劃或在 Agent 檢測到重要發現時觸發。

## Memory 讀寫週期

```python
def session_startup(memory_dir: str) -> str:
    """Read memory at session start."""
    sections = []
    # Always read long-term memory
    memory_path = os.path.join(memory_dir, "MEMORY.md")
    if os.path.exists(memory_path):
        sections.append(open(memory_path).read())
    # Read recent daily logs (today + yesterday)
    for days_ago in [0, 1]:
        date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        daily_path = os.path.join(memory_dir, f"memory/{date}.md")
        if os.path.exists(daily_path):
            sections.append(open(daily_path).read())
    return "\n---\n".join(sections)
```

## AGENTS.md 模式

一個相關但不同的檔案是 AGENTS.md——一個純文本檔案，定義 Agent 應該*如何行為*（而非它*記住什麼*）。放在任意目錄下，相容的 Harness 會自動讀取它：

```markdown
<!-- AGENTS.md -->
# Behavior

- You are a Python backend engineer
- Use pytest for all tests
- Follow Google style docstrings
- Never modify files in /config/ without asking

# Tools

- Prefer `ruff` over `pylint` for linting
- Use `uv` for package management
```

AGENTS.md 是**宣告式的**（做什麼），MEMORY.md 是**經驗式的**（發生了什麼）。兩者都在 Session 啟動時注入 Context，但用途不同。

## 常見誤區

- **把 Context 當成無限的** —— 即使 128K Token 也會被 Tool Schema、檔案內容和對話歷史快速填滿。顯式規劃你的 Token 預算。
- **從不裁剪 Session 歷史** —— 50 輪對話會累積大量冗餘內容。壓縮或摘要舊輪次以回收空間。
- **過於頻繁地寫 Memory** —— 不是每一輪都會產出值得持久化的知識。過度寫入會產生噪音，稀釋有用資訊。
- **啟動時忘記讀 Memory** —— 不讀 Memory 的 Agent 就是失憶的。這是最常見的配置 bug。

## 延伸閱讀

- [Letta: MemGPT and the Future of Agent Memory](https://www.letta.com/blog/memgpt) —— 受作業系統啟發的 Agent Memory 管理
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— 生產中的 Memory 模式
