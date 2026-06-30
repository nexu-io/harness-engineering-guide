---
title: "Initializer + Coding Agent — 一個兩階段 Harness 模式"
author: Nexu
date: "2026-04-19"
description: "為什麼帶 Compaction 的單 Agent 迴圈無法構建一個多天的專案，以及把 Harness 拆成 Initializer 階段和反覆執行的 Coding 階段如何修復它。"
tags: [harness, long-running-agents, context-engineering, patterns]
---

# Initializer + Coding Agent — 一個兩階段 Harness 模式

如果你曾經給一個前沿 Coding 模型喂一個類似 *"給我建一個 Claude.ai 的 clone"* 的 Prompt，然後走開去忙一下午，你就知道這事的結局：一個倉庫裡有一個能用的登入表單，半個訊息列表，檔案中間夾著 `TODO: hook up streaming`，以及一條非常自信的 commit message。模型耗盡了 Context。

本能反應是怪模型。其實幾乎總是 Harness 的鍋。

本文講的是一個專門修復這類 failure 的模式：**把你的長程 Agent 拆成兩個階段——一個 Initializer 只跑一次，一個 Coding Agent 跑很多次，每個 session 在一張乾淨的白紙上只做一個 feature。**

它基於 [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)，並引用了 [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)。我想展開講講它*為什麼*能 work，而不只是它長什麼樣。

---

## Core insight：Compaction 不夠用

對"Context Window 是有限的"這個問題的標準答案是 Compaction。把舊的東西總結一下，保留新的東西，永遠迴圈。

Compaction 對一個兩小時的重構沒問題。對一個兩天的構建就垮了。

把 Opus 4.5 放在 Agent SDK 上，餵它一個高層 Prompt 比如"build a Claude.ai clone"，看看：

- Session 1 寫了一大堆程式碼，撞上 Context 上限時還有一半 feature 沒完成。
- Session 2 讀一份 Compaction 後的摘要——一個有損的、敘事版本的已發生事情——然後得從中重建意圖。
- Session 3 讀一份"Compaction 的 Compaction"。資訊按幾何級衰減。

到 Session 4，模型在跟過去的自己玩傳話遊戲。它不知道哪些 feature 做完了，哪些做了一半，哪些是它在摘要裡幻覺出來的。

**Compaction 是 in-context memory。長程 Agent 需要 out-of-context memory**——檔案、結構化狀態、git 歷史。Agent 在每個 session 都重新讀取的東西，而不是靠總結傳遞下去的東西。

這就是論點。其餘都是機械細節。

---

## 你會撞到的兩種 failure 模式

在講模式之前，讓我們具體說一下沒有這個模式時會出什麼錯。兩種 failure 模式最常見。

### (A) 一氣呵成傾向

模型試圖在一個 session 裡做完所有事。給一個大 Prompt，它寫一個大方案。Context 填滿了。它繼續推。Session 以一堆實現了一半的 feature、散在函式中間的 `// TODO`、一個跑不起來的測試套件、以及沒有可回去的乾淨 commit 結束。模型根本不知道自己壞了——它在能檢查之前就把空間耗光了。

### (B) 過早勝利

更狡猾。Session 2 讀 Session 1 的進度筆記："implemented login, messaging, streaming."。模型看程式碼，看到一些*看起來像* login + messaging + streaming 的東西，就宣佈專案做完了。它沒執行它。它沒測試流程。它相信了敘事。

過早勝利是一氣呵成的對偶。一氣呵成失敗是因為模型試圖做太多；過早勝利失敗是因為下一個模型相信了上一個模型的樂觀。任何長程工作的 Harness 都必須**同時**解決這兩者。這也是為什麼天真的"用 Compaction 迴圈就好"不夠用——Compaction 強化了上一個 session 的敘事，而當敘事過度樂觀時，這恰恰是錯的方向。

---

## 兩階段 Harness

修復是結構性的。一個 Agent 不再做所有事。你有兩個角色，職責不同、生命週期不同。

```
 ┌──────────────────────────────────────────────────────────────┐
 │                        HARNESS DRIVER                        │
 │                     (your Python script)                     │
 └──────────────────────────────────────────────────────────────┘
                  │                              │
                  │ runs once                    │ runs N times
                  ▼                              ▼
 ┌──────────────────────────┐     ┌──────────────────────────────┐
 │    INITIALIZER AGENT     │     │        CODING AGENT          │
 │                          │     │                              │
 │ • read spec / brief      │     │ • pwd + read git log         │
 │ • write init.sh          │     │ • read claude-progress.txt   │
 │ • write feature_list.json│     │ • read feature_list.json     │
 │ • write progress file    │     │ • pick highest-priority unit │
 │ • git init + first commit│     │ • run init.sh (dev server)   │
 │                          │     │ • implement ONE feature      │
 │                          │     │ • e2e test via browser       │
 │                          │     │ • flip passes: true          │
 │                          │     │ • commit + update progress   │
 └──────────────────────────┘     └──────────────────────────────┘
              │                                  ▲
              │                                  │
              └───── clean state repo ───────────┘
                     (shared on disk)
```

Initializer **只跑一次**。它的工作是把一個模糊的人類簡報變成一個具體的、機器可讀的計劃加一個可執行的腳手架。

Coding Agent **跑很多次**，每次呼叫都是一個全新的程序，沒有上一次的記憶。它通過讀取之前 session 寫到磁碟上的檔案來獲得記憶。

兩個 Agent，兩個目的，一個共享的檔案系統。

---

## Initializer Agent

Initializer 是唯一一次性思考整個專案的階段。在它結束之後，沒人再擁有全域性視角——每個 Coding session 都在區域性工作。

恰好四個產物：

1. **`init.sh`** — 一個指令碼，從一次冷 checkout 開始搭起專案：裝依賴、跑遷移、後臺啟動 dev server、列印 URL。每個 Coding session 都先跑它。如果 `init.sh` 壞了，其它的都不重要。
2. **`feature_list.json`** — 分解好的 backlog。格式細節在下一節。
3. **`claude-progress.txt`** — 關於專案進展到哪裡、接下來是什麼的簡短散文筆記。每個 session 結束時更新。
4. **一次初始 git commit** — 腳手架、指令碼、feature 列表、進度檔案全部在 `HEAD`。從這裡開始，每個 session 都以一次 commit 結束。`git log` 是已發貨內容的真相來源。

Initializer 不實現 feature。它不挑顏色。它擺好餐桌。

---

## Feature 列表設計：為什麼 JSON 勝過 Markdown

"這不就是個 todo 列表嗎，為什麼不用 Markdown checklist？"

因為當你給 Claude 一個 Markdown 檔案時，它把它當作散文。散文是可編輯的。模型會——帶著最好的意圖——重寫你的優先順序、改寫描述、把兩個 feature 合併因為它"感覺更乾淨"、把一個拆成五個因為它"澄清意圖"。Markdown todo 列表對 Agent 來說是流沙。

JSON 不同。模型被訓練成把 JSON 當作結構化資料——從中讀取和寫入特定欄位，而不是隨意重寫的東西。再加上一條明確規則規定只有一個欄位可寫，JSON 就成了近乎防彈的外部狀態。

一個合理的 schema：

```json
{
  "project": "claude-ai-clone",
  "created_at": "2026-04-19T10:00:00Z",
  "features": [
    {
      "id": "auth-01",
      "title": "Email + password sign up",
      "description": "User can create account with email + password. Passwords hashed with bcrypt. Email uniqueness enforced.",
      "priority": 1,
      "depends_on": [],
      "acceptance": [
        "POST /api/signup returns 201 with session cookie",
        "duplicate email returns 409",
        "password stored as bcrypt hash, not plaintext"
      ],
      "passes": false
    },
    {
      "id": "auth-02",
      "title": "Email + password sign in",
      "description": "User can log in with credentials from auth-01.",
      "priority": 2,
      "depends_on": ["auth-01"],
      "acceptance": [
        "POST /api/signin with valid creds returns 200 + cookie",
        "wrong password returns 401",
        "signed-in user can load /app"
      ],
      "passes": false
    },
    {
      "id": "chat-01",
      "title": "Minimal chat page with message list",
      "description": "Authenticated user sees a chat page with past messages rendered from the DB.",
      "priority": 3,
      "depends_on": ["auth-02"],
      "acceptance": [
        "GET /chat renders <ul> of messages",
        "unauthenticated GET /chat redirects to /signin"
      ],
      "passes": false
    }
  ]
}
```

這種紀律被編碼在 Coding Agent 的系統 Prompt 裡：

> You may only modify the `passes` field. It is unacceptable to remove or edit tests, acceptance criteria, descriptions, or the structure of this file. If you believe a feature is wrong, stop and report — do not silently rewrite it.

這段措辭不是在兜圈子——它是承重的。"Unacceptable" 對模型讀起來是一條硬規則。實踐中，它足以讓這個檔案在幾十個 session 裡保持穩定。

`passes: false` 是另一個關鍵細節。這是 Agent 唯一的槓桿。當一個 session 實現了一個 feature、通過了 e2e 測試、乾淨地 commit 了，它就把這個布林值翻成 `true`。一個欄位——不是散文，不是感覺——就是未來 session 得知什麼已經真的做完了的方式。

---

## Coding Agent：一個開機儀式，不是自由發揮

每次 Coding Agent 醒來，它在碰任何程式碼之前都要跑同樣的五步儀式。不可選。

```
1. pwd                         → confirm we're in the project
2. git log --oneline -20       → what shipped, most recent first
   cat claude-progress.txt     → narrative notes from last session
3. cat feature_list.json       → what's done, what's next, what's blocked
4. bash init.sh                → install, migrate, start dev server
5. hit the app in a browser    → verify last session's work still works
```

只有在第 5 步之後，Agent 才挑一個 feature 開始寫程式碼。

把這叫做 **context bootstrap**——Compaction 的 out-of-context 對應物。Agent 不是繼承一份摘要，而是從磁碟檔案重建它的工作上下文。相同的權威來源，相同的順序，每個 session。

有幾件事值得釘住：

- **git log 在進度筆記之前。** git 是基本真相；進度筆記是樂觀的。如果它們不一致，git 贏。
- **`init.sh` 不可協商。** 如果 dev server 起不來，上一個 session 聲稱的任何東西都不重要。
- **挑新 feature 之前先做 E2E 驗證。** 這就是殺死過早勝利的東西。你不信任上一個 session 的"done"——你開啟瀏覽器。

在第 3 步，Agent 挑選*單一、最高優先順序、`passes: false` 且所有依賴都已滿足的 feature*。不是兩個。不是"一組"。一個。然後當那一個變綠並 commit 時就停下。

一 session 一 feature 同時殺死兩種 failure 模式：它殺死一氣呵成，因為 contract 人為約束了範圍；它殺死過早勝利，因為"done"不是自封的——它是一個 e2e 測試在一個清晰界定的單元上通過。

---

## 端到端測試是信任層

單元測試必要但不充分。Coding Agent 寫了它們——它不能是唯一檢查它們的東西。如果模型誤解了規範，單元測試會和實現以同樣的形狀錯，它們會通過，但這不代表任何東西。

端到端是你得到獨立訊號的地方。把真實的 App 起起來，像使用者一樣驅動它，看看會發生什麼。

實踐中這意味著瀏覽器自動化。[Puppeteer MCP](https://github.com/modelcontextprotocol/servers) 運作良好——Agent 可以導航、填表、點選，並對 DOM 斷言。

`auth-01` 的一次驗證：

```
→ navigate to http://localhost:3000/signup
→ fill #email with "test+{{timestamp}}@example.com"
→ fill #password with "correct-horse-battery-staple"
→ click button[type=submit]
→ assert url === "/app"
→ assert response cookie "session" is set
→ navigate to /signup again with same email
→ fill + submit
→ assert error text contains "already exists"
```

三件事：(1) 它跑在 `init.sh` 啟動的真實 server 上，不是 mock；(2) 它檢查可觀測行為——URL、DOM、cookie——不是內部函式；(3) 它便宜到每個 session 都能跑，所以 bootstrap 的"上一個 session 的工作活下來了嗎？"檢查，也是一次針對已變綠 feature 的 e2e pass。

這就是讓 `passes: true` 有意義的東西。

---

## 乾淨狀態 commit：git + 進度檔案一起

在每個 Coding session 結束時，有兩件事按順序發生：

1. `git commit -m "feat(auth-01): email+password signup"` — 程式碼落地。
2. `claude-progress.txt` 被短短地追加一行——發了什麼，哪裡棘手，下一個 session 應該先看什麼。

它們做不同的工作。git 是**真相**層：僅追加、有時間戳、diff 不可協商。`claude-progress.txt` 是**提示**層：給下一個 Agent 的筆記，像"郵件模板住在 `/lib/email/`，我為了測試 monkeypatch 了 SMTP client，注意 `/api/signin` 裡有一個 race，我用 retry 繞過去了"。

兩者都會在每個 session 開始時被讀取。哪一個單獨都不夠。沒有提示的 git 很簡短，難以重建意圖。沒有 git 的提示會漂移。在一起，它們就是取代 Compaction 的 out-of-context memory。

兩者都應該以一個*乾淨*狀態結束 session——沒有未 commit 的改動，沒有寫了一半的檔案，沒有壞掉的 dev server。如果 feature 在 Context 上限之前沒做完，**session 回到上一次乾淨 commit 並報告"未完成"**，而不是 commit 壞掉的工作。這就是你保持 git 可信的方式。

---

## 這個模式適合（和不適合）的場景

在伸手夠這個模式之前，對你專案的形狀要誠實。

**好的匹配：** Web 應用（feature 可分解，e2e 可測），CLI（每個子命令是一個自然單元），內部工具 / 儀表盤 / 管理面板，有離散階段的資料管道。

**壞的匹配：** 單演算法研究，比如"設計一個更好的 attention 機制"（無法分解成 `passes: true/false`）；高度耦合的程式碼庫，動一個函式會迫使動整個東西；任何價值存在於元件*關係*中的東西——一個編譯器的正確性在全域性不變數裡，而不是"加 lexer" + "加 parser"。

經驗法則：如果你能把驗收寫成"一個使用者（或 shell）做 X，觀察到 Y"，這個模式 work。否則挑別的 Harness。

---

## 實現草圖

Harness driver 本身很小。大部分工作在兩個系統 Prompt 裡。

```python
# harness.py — pseudocode, omit the error handling for clarity
from pathlib import Path
import json, subprocess, time
from claude_sdk import run_agent

PROJECT = Path("./project")

def initialize(brief: str) -> None:
    """Run once. Turns a brief into a runnable scaffold."""
    run_agent(
        system_prompt=INITIALIZER_PROMPT,
        user_prompt=brief,
        workdir=PROJECT,
        allowed_tools=["write_file", "run_shell", "git"],
        # the initializer is expected to produce:
        #   init.sh, feature_list.json, claude-progress.txt, first git commit
    )
    assert (PROJECT / "feature_list.json").exists()
    assert (PROJECT / "init.sh").exists()

def next_feature() -> dict | None:
    features = json.loads((PROJECT / "feature_list.json").read_text())["features"]
    features.sort(key=lambda f: f["priority"])
    for f in features:
        if f["passes"]:
            continue
        if all(done(dep) for dep in f["depends_on"]):
            return f
    return None  # everything done

def done(feature_id: str) -> bool:
    features = json.loads((PROJECT / "feature_list.json").read_text())["features"]
    return any(f["id"] == feature_id and f["passes"] for f in features)

def code_one_feature() -> bool:
    feat = next_feature()
    if feat is None:
        return False
    run_agent(
        system_prompt=CODING_PROMPT,         # includes the startup ritual
        user_prompt=f"Implement feature {feat['id']}: {feat['title']}",
        workdir=PROJECT,
        allowed_tools=["read_file", "write_file", "run_shell", "git", "puppeteer"],
    )
    # agent is expected to leave a clean commit + updated progress file
    return True

if __name__ == "__main__":
    if not (PROJECT / "feature_list.json").exists():
        initialize(open("brief.md").read())
    while code_one_feature():
        time.sleep(1)  # fresh process each iteration — no state carried over
    print("all features passed.")
```

兩件事要內化：**每一次 `run_agent` 呼叫都是一個全新程序**——沒有共享記憶體，沒有共享 Context Window，記憶就是檔案系統。**而 driver 是故意笨的**——它不挑 feature、不驗證工作、不解釋結果。所有的智慧都在 Prompt 和產物裡。

---

## 結語

這個模式之所以 work，不是因為 Initializer 或 Coding Agent 聰明。它 work 是因為 **"我知道什麼？"是由磁碟上的檔案回答的，不是由 Context Window 的內容回答的。**

每次你把狀態從 in-context 挪到 out-of-context，你都獲得了永續性，而且沒有失去任何重要的東西。兩階段 Harness 是一種有主張的方式來做這個挪動，應用在跨多個 session 構建軟體這個具體問題上。

如果你的長程 Agent 總在"忘事"，修復幾乎從來都不是一個更大的 Context Window。是更多的檔案。

---

## 延伸閱讀

- [scheduling-and-automation.md](./scheduling-and-automation.md) — 如何不靠人類保姆式照看，按時間表喚醒 Coding Agent
- [long-running-harness.md](./long-running-harness.md) — 這個模式所屬的更大模式家族
- [memory-and-context.md](./memory-and-context.md) — 對 out-of-context memory、檔案佈局和 bootstrap 儀式的更深入講解
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering，原始素材
- [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding) — 兩階段模式的可執行參考實現
