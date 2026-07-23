---
title: "Agent Teams：並行 Claude 打造真實軟體"
author: Nexu
date: "2026-04-19"
description: "一支由 16 個並行 Claude 組成的艦隊如何構建了一個 10 萬行 Rust C 編譯器——以及它給 Harness 設計的啟示。"
tags: [agents, harness, parallelism, orchestration, case-study]
---

# Agent Teams：並行 Claude 打造真實軟體

大多數 Agent 演示看起來令人印象深刻，但毫無用處。一個 to-do list 應用。一個待辦爬蟲。一個把三個網頁總結一下的"個人研究助手"。

然後有人把 16 個 Claude 接進一個迴圈，它們構建了一個可以編譯 Linux 核心的 C 編譯器。

本文講的就是第二件事——具體來說，它底層的 Harness 長什麼樣。我們會沿著 Nicholas Carlini 專案 *"Building a C compiler with a team of parallel Claudes"*（[Anthropic Engineering](https://www.anthropic.com/engineering/building-c-compiler)，[GitHub](https://github.com/anthropics/claudes-c-compiler)）的架構走一遍，抽出真正起作用的設計原則，並把它們翻譯成你可以在自己 Harness 裡複用的模式。

---

## Core Insight

> **16 個 Claude 例項，並行執行約兩週，生產出了一個用 Rust 寫的 10 萬行 C 編譯器。它在 x86、ARM 和 RISC-V 上都能編譯 Linux 6.9。它通過了 GCC torture test suite 99% 的測試。它能編譯 QEMU、FFmpeg、SQLite、Postgres 和 Redis。**

再讀一遍。再讀一遍。

這不是玩具。這是一個真實的產品級編譯器，由一個 LLM 團隊在比人類團隊能容忍的更嚴苛的約束下寫出來：沒有網際網路訪問，沒有現成的 compiler crate，不能從 LLVM 或 tcc 抄程式碼——只有 Rust 標準庫，以及 Claude 從 C 規範和它的訓練裡能推理出的東西。由 Agent 做的一次潔淨室實現。

有意思的問題不是"LLM 能不能寫編譯器"。我們已經知道它能寫*其中一部分*。有意思的問題是：

**什麼樣的 Harness，能把 16 個無狀態、健忘的 LLM 呼叫，變成一支能交付 10 萬行程式碼的連貫工程團隊？**

---

## 專案成績單

在我們深入架構之前，這裡是帳本：

```
┌─────────────────────────────────────────────────────────────┐
│  Parallel Claudes:     16                                   │
│  Total sessions:       2,000+                               │
│  Wall-clock time:      ~2 weeks                             │
│  API cost:             ~$20,000                             │
│  Human code written:   ~0 lines (harness + prompts only)    │
│  Lines of Rust:        ~100,000                             │
│                                                             │
│  Torture-test pass:    99% (GCC torture suite)              │
│  Self-hosts Linux:     ✅ 6.9 on x86 / ARM / RISC-V         │
│  Also compiles:        QEMU, FFmpeg, SQLite, Postgres,      │
│                        Redis                                │
│                                                             │
│  Net-access for agent: ❌ none                              │
│  External crates:      ❌ std lib only                      │
└─────────────────────────────────────────────────────────────┘
```

按業餘愛好者的標準，2 萬美元的 C 編譯器很貴；按編譯器團隊的標準，便宜得可笑。一個兩人的編譯器創業公司在三個工作日里就能燒掉 2 萬美元。

---

## Ralph-Loop 架構

Harness 的核心尷尬地簡單。每個 Agent 都是一個 bash 迴圈：

```bash
#!/usr/bin/env bash
# agent.sh — run inside a Docker container
while true; do
  claude --dangerously-skip-permissions -p AGENT_PROMPT.md
done
```

就這樣。這就是整個 Agent。

沒有 Orchestrator。沒有任務佇列守護程序。沒有 Scheduler。沒有 Message Bus。當一個 Claude session 結束——成功、失敗、或者 Context Window 崩塌——迴圈就用同一個 Prompt 檔案啟動一個新的 Claude。Prompt 告訴新的 Claude：去看看倉庫，想清楚下一步該做什麼，然後去做。

這種風格有時被稱為 "Ralph-Loop"（取自 Ralph Wiggum 的 "I'm helping!"）：一個笨笨的外層迴圈不停地踢一個聰明的內層程序，直到工作完成。

唯一的管理員級干預是：

```bash
# kill the fleet
pkill -9 bash
```

這就是整個關閉協議。沒有 graceful drain，沒有"請完成你當前的任務"。你 SIGKILL 掉那些 bash 迴圈，Agent 就在思考一半時死掉。下次你啟動它們時，它們會從 `git pull` 留下的位置繼續。

### 為什麼這能 work

Ralph-Loop 是 Agent 工作的正確形狀，有三個原因：

1. **LLM 在不同 session 之間本來就是無狀態的。** 假裝它們是長期執行的程序，只會把 Context Window 的崩塌藏在越來越絕望的小把戲後面。
2. **重啟是免費的。** 一個新的 Claude 去讀倉庫，比一個已經用 3 小時失敗實驗填滿 Context 的 stale Claude 更便宜。
3. **失敗隔離是免費的。** 如果一個 session 跑偏了，下一個 session 不會繼承那些廢墟——它繼承的是 git 狀態，那是唯一的真相來源。

---

## 基於 git 的協調（沒有 Orchestrator）

這裡是大多數人會驚訝的部分：**沒有中心 Orchestrator。** 沒有東西在分發任務。沒有東西知道誰在做什麼。沒有寫著"agent-7 目前在處理 struct-packing"的儀表盤。

相反，艦隊通過兩個原語協調：

1. 一個 **bare git repo**，每個容器都往裡 push 和從裡 pull。
2. 一個叫 `current_tasks/` 的目錄，裡面裝著**鎖檔案**——每個進行中的任務一個，寫作 `current_tasks/<task-name>.txt`。

每個 Agent 的 Prompt 實際上在告訴它：

> "看一下開放的 TODO、失敗的測試和進度檔案。挑一個當前沒人在做的最顯而易見的下一件事。為它放一個鎖檔案。做這份工作。commit。移除鎖。退出。"

下面是每個 session 的生命週期：

```
 ┌──────────────────────────────────────────────────────────────┐
 │  1. git clone / pull                                         │
 │  2. scan repo → pick task T                                  │
 │  3. git add current_tasks/T.txt   ← claim the lock           │
 │  4. git push                      ← publishes the claim      │
 │  5. work on T (write code, run tests, commit)                │
 │  6. git pull --rebase             ← grab peers' changes      │
 │  7. resolve merges / re-run tests                            │
 │  8. git push                      ← ship it                  │
 │  9. git rm current_tasks/T.txt    ← release lock             │
 │ 10. git push                                                 │
 │ 11. exit → Ralph loop spawns a new Claude in a new container │
 └──────────────────────────────────────────────────────────────┘
```

### 競態，以及為什麼 git 贏

兩個 Agent 同時醒來。它們都看開放任務。它們都認定最顯而易見的事是"修 codegen/x86.rs 裡的 segfault"。它們都寫了 `current_tasks/fix-segfault-x86.txt`。它們都 `git push`。

一個 push 贏。另一個 push 被拒——`non-fast-forward`。那個 Agent 做 `git pull --rebase`，看到鎖已經存在，意識到自己遲到了，就去挑另一個任務。

這就是關鍵動作：**git 的併發模型就是 Agent 團隊的併發模型。** 鎖、合併、衝突解決——這些都是免費的，因為 git 已經解決了它們。你不用在你的 LLM 之上搭一篇分散式系統論文；你從 2005 年繼承了一篇。

---

## 設計原則 1：為 Claude 寫測試，不是為你自己寫

這是我想紋在每個構建 Agent Harness 的人腦門上的教訓。

當一個人類讀一個失敗的測試時，他免費得到了很多：他可以掃一眼 500 行輸出，注意到一個可疑的模式，在腦子裡保持一個假設，然後去除錯。迴圈中的 LLM 這些事都做不好。你的測試 Harness 必須按它的限制來設計，不是按你的。

### Context Window 汙染

大多數測試執行器的預設行為是"把所有東西都 dump 到 stdout"。那對於在終端裡滾動的人類來說沒問題；對於 Claude 來說是災難性的。一千行測試輸出會吃掉 Context Window，到 Claude 開始推理這個 bug 時，它已經忘了 Prompt。

**修復**：讓測試 Harness 預設極度簡潔，把詳細輸出送到檔案。

```python
def run_test(name: str) -> TestResult:
    result = execute(name)
    # Human-visible (and LLM-visible) output: one line.
    if result.ok:
        print(f"PASS {name}")
    else:
        print(f"ERROR {name}  see logs/{name}.log")
    # Everything else goes to disk.
    write(f"logs/{name}.log", result.full_output)
    return result
```

現在 Claude 看到的是：

```
PASS  tests/struct_layout_01
PASS  tests/struct_layout_02
ERROR tests/struct_layout_03  see logs/struct_layout_03.log
PASS  tests/struct_layout_04
```

Claude 可以在整個執行裡 `grep ERROR`，挑一個 failure，然後只 `cat` 相關的那個 log。Context 保持小。注意力保持聚焦。

### `ERROR` 標記

注意那個字面量 `ERROR`。那是刻意的。一個一致的、可 grep 的標記，是任何 Agent Harness 裡投入回報率最高的約定之一。它意味著 Claude 可以用一個 `grep -l ERROR logs/` 瀏覽成千上萬條測試結果。不要在一個地方寫"failed"，在另一個地方寫"FAIL"，在第三個地方寫"❌"。選一個。到處都用它。

### 時間盲

Claude 沒有掛鐘。它無法分辨"這個測試慢"和"這個測試卡死了"。如果你讓一個 Agent 每個 session 都跑完整測試套件，你一半的 Agent 會在那裡坐 40 分鐘，判定啥事沒發生，殺掉測試套件，然後去做一些狂野的重構。

**修復**：加一個 `--fast` 子取樣模式，按 Agent 確定性地跑 1–10% 的測試：

```python
def select_tests(all_tests: list[str], agent_id: str, fraction=0.05):
    # Same agent → same subsample within a session.
    # Different agents → different subsamples, so the fleet covers
    # more ground than any single agent does.
    rng = seeded_random(agent_id)
    k = max(1, int(len(all_tests) * fraction))
    return rng.sample(all_tests, k)
```

這裡有兩個屬性很重要：

- **每個 Agent 內部確定性**：同一個 Agent 跑同一個命令兩次，看到的結果一樣。否則 Claude 就無法推理自己的改動是否修好了什麼東西。
- **跨艦隊不同**：每個 Agent 探測測試套件的不同角落，他們的並集覆蓋度比任何單個 Agent 都高得多。

### 進度檔案與 README

唯一的長壽命記憶是檔案系統。Carlini 的 Agent 維護：

- 每個模組頂部的 `README.md`：*這個模組是做什麼的，什麼在 work，什麼不 work*。
- `PROGRESS.md` 和按區域的進度檔案：*嘗試過什麼，失敗過什麼，當前的理論是什麼*。

這些不是給人類看的。它們是給下一個醒來的 Claude 看的。當你把進度檔案當作**給未來自己的資訊**，它們就成了倉庫裡最有價值的產物。

---

## 設計原則 2：並行友好的任務分解

並行不是關於你的團隊的事實。它是關於你*工作*的事實。

### 簡單模式：很多獨立的失敗

Agent 團隊的快樂情形，是一個有很多獨立失敗測試的測試套件。200 個失敗測試，16 個 Agent，每個 Agent 抓一個，修好它，commit，繼續。衝突最少。線性擴展。大家都高高興興回家。

```
┌───────────────────────┐
│  200 failing tests    │
├───────────────────────┤
│  agent-1 → test 47    │
│  agent-2 → test 113   │
│  agent-3 → test 2     │
│  agent-4 → test 88    │
│   ...                 │
└───────────────────────┘
```

### 困難模式：一個單體的構建

現在設想目標是：*編譯 Linux 核心*。只有一個任務。一個構建。一個失敗的產物。16 個 Agent 全都開始讀核心原始碼、提修復方案。它們互相覆蓋。它們在 bug 該修在 parser 裡還是 codegen 裡上意見不合。倉庫變成一場汽車拆毀大賽。

更多 Agent 現在*更糟*。把更多 Claude 扔到一個不可分割的單體問題上，就是在一個下午燒掉 2 萬美元、什麼也拿不出的方式。

修復不是"加一個 Orchestrator"。修復是**把單體分解為獨立的失敗**。這就把我們引向了整個專案裡最聰明的一個點子。

---

## GCC 作為 Oracle：對核心做二分

當團隊試圖用他們的新編譯器編譯 Linux 核心時，東西以壯觀而纏繞的方式崩了。幾百個檔案共同導致了一個壞映象。沒人——不是 Claude，也不是人類——能看著"核心不啟動"，告訴你 2 萬個 C 檔案裡的哪一個暴露了 bug。

關鍵動作：**把 GCC 當作已知好的 Oracle，讓 Claude 只編譯一個子集**。

```
┌────────────────────────────────────────────────────────────┐
│  For each kernel .c file:                                  │
│    flip a coin biased toward GCC (say 95/5)                │
│    → if GCC: compile with GCC (trusted)                    │
│    → if Claude: compile with Claude's compiler             │
│                                                            │
│  Link everything into a kernel image. Boot it.             │
│                                                            │
│  If it boots: great. Try a larger Claude subset.           │
│  If it breaks: Claude's subset contains the bug.           │
│                 → bisect the subset, narrow down,          │
│                   identify the specific failing file,      │
│                   file a focused bug report,               │
│                   add it as an isolated failing test.      │
└────────────────────────────────────────────────────────────┘
```

虛擬碼：

```python
def locate_bad_file(c_files: list[str]) -> str:
    # Standard bisection against a known-good oracle.
    lo, hi = 0, len(c_files)
    while hi - lo > 1:
        mid = (lo + hi) // 2
        subset = c_files[lo:mid]
        image = build_kernel(subset, compiler="claude",
                             rest_compiler="gcc")
        if boots(image):
            lo = mid       # bug is in the upper half
        else:
            hi = mid       # bug is in the lower half
    return c_files[lo]
```

一旦你把 bug 定位到一個檔案，你就完成了關鍵一步：你把一個單體失敗轉化成了一個**獨立的、可復現的測試用例**。現在你又回到了簡單模式——一個具體的失敗測試，一個 Claude 就能獨立解決。

這個模式的通用形狀：

> **當一個任務太大以至於無法並行化，就找一個可信的 Oracle，讓大部分工作通過 Oracle 跑，讓你的 Agent 在一個不斷縮小的子集上慢慢啃，直到剩下的每個 failure 都是區域性的。**

這是一個 Harness 設計模式，不是編譯器模式。它適用於任何你有一個帶有可信參照的單體系統的場景——資料管道、模型訓練子元件、配置生成、甚至 UI 渲染。

---

## Agent 角色特化

所有 16 個 Agent 都是同一個 Claude 二進位制，但它們的 Prompt 給了它們不同的*工作*。這聽起來是件小事；它不是。給每個 Agent 一個獨特的角色，大大減輕了"所有人圍著同一個 failure 擠"的病態。

專案中的五個角色，改述如下：

```
┌──────────────────────────┬──────────────────────────────────┐
│ Role                     │ Prompt flavor                    │
├──────────────────────────┼──────────────────────────────────┤
│ duplicate-code-cleaner   │ Find repeated patterns, extract  │
│                          │ helpers, reduce LOC without      │
│                          │ changing behavior.               │
├──────────────────────────┼──────────────────────────────────┤
│ performance-tuner        │ Profile, find hot paths, apply   │
│                          │ local optimizations. Do not      │
│                          │ change semantics.                │
├──────────────────────────┼──────────────────────────────────┤
│ codegen-optimizer        │ Focus on the backend. Improve    │
│                          │ emitted assembly quality.        │
├──────────────────────────┼──────────────────────────────────┤
│ design-critic            │ Do not write code. Read the repo │
│                          │ and file TODOs for design smell, │
│                          │ dead code, inconsistency.        │
├──────────────────────────┼──────────────────────────────────┤
│ doc-maintainer           │ Keep README / PROGRESS files     │
│                          │ honest and current.              │
└──────────────────────────┴──────────────────────────────────┘
```

角色分離之所以重要，是因為它**改變了一個 Agent 認為哪些任務是"最顯而易見的"**。一個 `design-critic` 看倉庫時看到的"下一件事"，和一個 `performance-tuner` 看同一個倉庫看到的不一樣。艦隊在沒有任何中心 Scheduler 決定誰做什麼的情況下，覆蓋了更多的工作面。

對你自己的 Harness 而言，一般規則是：**如果兩個 Agent 一直在撞車，通常是因為它們的 Prompt 沒有區分什麼叫"顯而易見的下一步"。**

---

## 什麼時候不該搭一個 Agent Team

文章誠實的部分。Agent Team 昂貴、笨拙、偶爾有魔法。它們對大多數工作都不是合適的工具。如果下面任何一條成立，*不要*搭：

- **專案小。** 如果單個聚焦的 Claude session 能一次過完成任務，一個 16 Agent 的艦隊只會產生協調開銷、合併衝突，以及一個 5 美元活兒的 500 美元帳單。一把鋒利的刀勝過十六把鈍刀。
- **工作需要緊密協調。** 涉及大量橫切決定的設計——API schema、協議不變數、共享資料模型——會被並行 Agent 摧毀。Agent 擅長"去修這個失敗的測試"。它們不擅長"我們來商量一下錯誤型別層級應該長什麼樣"。
- **你沒有一個好的測試 Oracle。** 編譯器有 GCC torture test suite 和一個要麼啟動要麼不啟動的核心。大多數軟體沒有一個可信的、可自動化的、確定性的"它 work 了嗎？"訊號。沒有它，你的 Agent 最佳化的是驗證器檢查的東西，而不是你真正想要的東西——由於驗證器是不完美的，它們會朝錯誤的方向最佳化。
- **你不能便宜地重啟。** Ralph-Loop 假設重啟是免費的。如果你的 Agent 要預熱 30 分鐘才能開始有用工作，迴圈的攤銷就很差，艦隊會輸給一個長壽命的程序。

如果任何一條成立，就用一個 Claude 加一個好 Prompt，停手。

---

## 這給 Harness 構建者的啟示

從這個具體專案抽離出來，有五個想法可以乾淨地遷移：

1. **git 是 Agent 協調的原語。** 別搭任務佇列、鎖服務、Message Bus。用 git。鎖、合併、衝突解決、歷史、回滾——你全都免費獲得，而且是被已經認真思考過併發的人們設計的。
2. **測試套件的品質是 Agent 能力的天花板。** Claude 只能和你給它的訊號一樣好。不成比例地投入測試、Oracle 和驗證器。一個有好測試套件的平庸 Agent，每一次都勝過一個有平庸測試套件的出色 Agent。
3. **為 Claude 設計 Harness，不是為你。** 預設簡潔輸出。`ERROR` 標記。完整日誌入檔案。確定性子取樣。進度檔案作為給未來 session 的信件。每一條的存在，都是因為 Agent 和你不一樣——更健忘、更易分心、對時間盲。
4. **用已知好的 Oracle 分解單體。** 當問題抵抗並行，不要加更多 Agent；加一個可信參照，讓大部分工作通過它跑，讓 Agent 攻擊一個縮小的殘餘。GCC-as-oracle 是一個通用模式。
5. **通過 Prompt 做特化。** 同一個模型，不同工作。讓 16 個 Agent 互不踩踏的最便宜、最好擴展的方式，就是給它們不同的"顯而易見下一步"的定義。

2 萬美元的帳單買了一個編譯器。免費的贈品是一份 Agent Team 起作用時的工作藍圖。

---

## 延伸閱讀

本指南內：

- [multi-agent-orchestration.md](./multi-agent-orchestration.md) — 超越 Ralph-Loop 的 Agent 艦隊協調模式。
- [sandbox.md](./sandbox.md) — 用 Docker 和 bare git 倉庫做每 Agent 隔離。
- [sub-agent.md](./sub-agent.md) — 什麼時候生成 sub-agent 而不是往艦隊里加同伴。

外部：

- Nicholas Carlini / Anthropic Engineering — [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- [anthropics/claudes-c-compiler](https://github.com/anthropics/claudes-c-compiler) — 實際的倉庫，Harness 和一切。讀 Prompt。Prompt 就是產品。
