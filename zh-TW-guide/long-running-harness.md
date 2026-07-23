---
author: Nexu
---

# 長時執行 Agent Harness 設計

> **Core Insight:** 短任務 Agent 的失敗是顯式的——要麼完成，要麼超時。長時執行 Agent 的失敗是隱蔽的。它們會產生膨脹的上下文，悄無聲息地退化，並在偏離方向的同時說服自己正在出色地工作。設計長時執行 Agent 的 Harness，意味著針對這些失敗模式進行防禦。

## 為什麼長時執行 Agent 很難

"短任務" Agent——回答一個問題、寫一個函式、總結一篇文件——在單個 Context Window 內生存和消亡。它要麼完成，要麼可見地失敗。

"長時執行" Agent 執行數小時甚至數天：重構程式碼庫、撰寫 50 頁報告、執行多階段流水線。這些 Agent 面臨短任務 Agent 從未遇到的問題：

1. **上下文不斷累積。** 每次 Tool 呼叫、每個中間結果、每個推理步驟都會增加 Token。200K 的視窗填滿速度比你想像的快。
2. **品質悄然退化。** Agent 不會崩潰——只是變差。回答變得更含糊，指令被遺忘，早期的上下文被擠出。
3. **自我評估在撒謊。** 問一個 Agent "你的工作好嗎？"它永遠會說"好"。對於一個 30 秒就能目測檢查的任務，這沒什麼問題。但對於一個你沒在盯著的 4 小時流水線來說，這是災難性的。

## 失敗模式 #1：上下文焦慮

當長時執行 Agent 填滿 Context Window 時，會發生一些反直覺的事情：模型開始趕工。它過早地收尾、偷工減料，在工作實際完成之前就宣佈"完成"。

這就是**上下文焦慮**——模型對自己即將用盡空間的隱性感知。表現為：

- 跳過它通常會執行的步驟
- 產出更短、不夠深入的輸出
- 以"我已經涵蓋了要點"過早宣告完成
- 避免會增加更多上下文的 Tool 呼叫

上下文焦慮在各種架構中普遍存在。模型已經學會對話會結束，當空間縮小時，它傾向於走向結束。

**更大的視窗只是推遲問題，並不能解決它。** 修復之道在於架構層面：顯式管理上下文的生命週期。

## 失敗模式 #2：自我評估偏差

讓生成者評估自己的輸出。它會給自己打 8/10 或更高——持續如此，無論實際品質如何。這就是**自我評估偏差**，它是長時執行 Agent 的第二個隱形殺手。

為什麼？模型擁有自己推理的完整上下文——每個決策都感覺是合理的。承認失敗意味著否定之前的輸出，這是 LLM 所牴觸的。而且訓練資料獎勵自信而非自我懷疑。

在短任務中，人類能發現問題。在長時執行任務中，Agent 自主執行。如果它評估自己的輸出並總是說"看起來不錯"，錯誤就會不斷累積。

```
短任務：   Agent 產出 → 人類審查 → 反饋
長時執行：Agent 產出 → Agent 審查 → "看起來很棒！" → 錯誤不斷累積
```

對抗網路設計中的洞見在這裡同樣適用：**絕不讓生成者批改自己的試卷。**

## 上下文管理：重置 vs. 壓縮

當上下文用滿時，你有兩個選擇。每個都有實際的權衡。

### 上下文重置

清空對話，重新開始。將先前工作的摘要作為"簡報"傳入新的上下文。

```
Turn 1-50:  [完整對話歷史]
            ↓ 上下文 80% 已滿
Turn 51:    [系統提示 + Turn 1-50 的摘要 + 當前任務]
            ↓ 全新開始，~10% 上下文已用
Turn 51-100: [從摘要繼續]
```

**優點：** 清空重來，可預測的 Token 預算，消除新片段的上下文焦慮。

**缺點：** 有損——摘要會遺漏細微差別和失敗的方案。"摘要的摘要"在多次重置後會退化。Agent 可能重走死路。

### 上下文壓縮

選擇性壓縮較舊的輪次，同時保持最近的輪次完整。將多輪推理摺疊為摘要，丟棄冗長的 Tool 輸出。

```
Turn 1-20:  [已壓縮：早期探索的 3 行摘要]
Turn 21-40: [已壓縮：關鍵決策和結果]
Turn 41-50: [完整細節：最近進行中的工作]
```

**優點：** 保持連續性。漸進式——最近的輪次保留細節，較舊的輪次壓縮。Agent 保留對已嘗試過的方案的感知。

**缺點：** 壓縮品質參差不齊。實現更復雜。如果摘要與最新狀態矛盾，壓縮後的上下文可能讓模型困惑。

### 如何選擇？

| 場景 | 推薦 |
|------|------|
| 有明確階段的任務（調研 → 寫作 → 審查） | 階段之間重置 |
| 對單一產物的持續迭代 | 壓縮 |
| Agent 頻繁回顧早期決策 | 壓縮（保留決策歷史） |
| 上下文已積累大量 Tool 輸出 | 重置（Tool 輸出壓縮效果差） |

實踐中，許多 Harness 採用混合方案：階段內壓縮，階段間重置。

## 生成者-評估者架構

借鑑 GAN 的思路：生成器創造，判別器評判——獨立的網路，對立的目標。將同樣的原則應用到 Agent 上：

```
┌─────────────┐         ┌──────────────┐
│  生成者      │────────►│  評估者       │
│  (Agent A)  │         │  (Agent B)   │
│             │◄────────│              │
│  產出       │ 反饋    │  評判        │
│  輸出       │         │  輸出        │
└─────────────┘         └──────────────┘
        │                       │
        │    獨立的上下文        │
        │    獨立的提示詞        │
        │    獨立的評判標準      │
```

**關鍵設計規則：**

1. **獨立上下文。** 評估者不看生成者的推理過程——只看其輸出。這防止了同情偏差（"我理解你為什麼這麼做，所以沒問題"）。
2. **顯式評分標準。** 評估者根據具體的清單打分，而非憑感覺。"程式碼是否處理了邊界情況 X？"優於"程式碼好不好？"
3. **可操作的反饋。** 評估者返回具體問題，而非分數。"函式 `parse_input` 沒有處理空字串"是有用的。"7/10" 沒有用。
4. **迭代預算。** 為生成-評估迴圈設定上限。沒有限制的話，一個完美主義的評估者和一個急切的生成者會永遠迴圈下去。

```python
def generator_evaluator_loop(task, max_iterations=3):
    output = None
    for i in range(max_iterations):
        # 生成者：產出或修改
        if output is None:
            output = generator.run(task)
        else:
            output = generator.revise(task, output, feedback)

        # 評估者：以全新視角評判
        evaluation = evaluator.judge(task, output)  # 沒有生成者的上下文！

        if evaluation.passes:
            return output

        feedback = evaluation.issues

    return output  # 達到最大迭代次數後的盡力而為
```

## 三 Agent 架構：規劃者 → 生成者 → 評估者

對於複雜的長時執行任務，加入一個**規劃者**負責分解、執行和品質控制。

```
                    ┌─────────────┐
                    │   規劃者     │
                    │             │
                    │ 將任務分解   │
                    │ 為子任務     │
                    └──────┬──────┘
                           │
                           ▼
              ┌─── 子任務列表 ───┐
              │                    │
              ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  生成者      │      │  生成者      │   （並行或序列）
     │  子任務 1    │      │  子任務 2    │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  評估者      │      │  評估者      │
     │  子任務 1    │      │  子任務 2    │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            └────────┬───────────┘
                     ▼
              ┌─────────────┐
              │   規劃者     │
              │  （審查      │
              │   結果，     │
              │   必要時     │
              │   重新規劃） │
              └─────────────┘
```

**規劃者** — 將目標分解為帶有成功標準的子任務。當評估者標記問題時重新規劃。持有願景但不執行。

**生成者** — 每次用全新上下文執行一個子任務。擁有 Tool、檔案、執行環境。不評估自己的工作。

**評估者** — 只看到生成者的輸出（不看推理過程）。根據規劃者的標準打分。返回通過/失敗以及具體問題。

關鍵屬性：**每個 Agent 在自己的 Context Window 中執行。** 生成者可以用 200K 視窗來進行程式碼探索，仍然產出乾淨的輸出。評估者從頭開始。規劃者保持高層視角，不涉及實現細節。

```python
def three_agent_pipeline(goal, max_replans=2):
    plan = planner.decompose(goal)

    for replan in range(max_replans + 1):
        results = {}
        for subtask in plan.subtasks:
            # 生成者：每個子任務全新上下文
            output = generator.execute(subtask)

            # 評估者：全新上下文，只看輸出 + 標準
            evaluation = evaluator.judge(
                subtask=subtask,
                output=output,
                criteria=subtask.success_criteria
            )

            results[subtask.id] = {
                "output": output,
                "evaluation": evaluation
            }

        # 檢查所有子任務是否通過
        failures = [r for r in results.values() if not r["evaluation"].passes]
        if not failures:
            return assemble_results(results)

        # 重新規劃：規劃者看到哪些子任務失敗了及原因
        plan = planner.replan(goal, results)

    return assemble_results(results)  # 盡力而為
```

## 反模式

### 反模式 #1：單體 Agent

將規劃、執行、評估和上下文管理全塞進一個 Agent。

```python
# 不要這樣做
response = llm.chat(
    system="""You are a planner, coder, reviewer, and project manager.
    First plan the work, then do the work, then review your own work.
    If the review finds issues, fix them and review again.""",
    messages=conversation  # 150K Token 的累積歷史
)
```

這會因為上述所有原因而失敗：上下文填滿、自我評估不可靠、沒有關注點分離。對簡單任務有效，對複雜任務則崩潰。

### 反模式 #2：沒有評分標準的評估

```python
# 不要這樣做
evaluation = evaluator.judge(
    prompt=f"Is this output good? Rate 1-10.\n\n{output}"
)
# 結果：永遠 8/10。永遠。
```

沒有標準的評估者只是一個有冒名頂替綜合症的生成者。始終提供評分標準：

```python
# 應該這樣做
evaluation = evaluator.judge(
    prompt=f"""Evaluate the following output against these criteria:
    1. Does every function have error handling for edge cases?
    2. Are all API calls wrapped in retry logic?
    3. Does the code match the spec in {spec_file}?
    4. Are there any hardcoded values that should be config?

    Output to evaluate:
    {output}

    For each criterion, answer PASS or FAIL with a one-line explanation."""
)
```

### 反模式 #3：無限重新規劃

```python
# 不要這樣做
while not all_subtasks_pass:
    plan = planner.replan(goal, results)  # 永遠迴圈
    results = execute_plan(plan)
```

始終設定迭代上限。三次重新規劃失敗意味著是規範問題，而不是執行問題。將其交給人類處理。

## 整合：最小實現

```python
class LongRunningHarness:
    """規劃者 → 生成者 → 評估者 Harness，用於長時執行任務。"""

    def __init__(self, planner_model, generator_model, evaluator_model):
        self.planner = Agent(model=planner_model, role="planner")
        self.generator = Agent(model=generator_model, role="generator")
        self.evaluator = Agent(model=evaluator_model, role="evaluator")

    def run(self, goal, max_replans=2, max_gen_iterations=3):
        plan = self.planner.decompose(goal)

        for _ in range(max_replans + 1):
            results = {}

            for subtask in plan.subtasks:
                output = self._generate_with_eval(
                    subtask, max_iterations=max_gen_iterations
                )
                results[subtask.id] = output

            failures = {k: v for k, v in results.items() if not v["passed"]}
            if not failures:
                return self._assemble(results)

            plan = self.planner.replan(goal, plan, failures)

        # 盡力而為——返回已有結果，標記未完成
        return self._assemble(results, partial=True)

    def _generate_with_eval(self, subtask, max_iterations):
        output = None
        for i in range(max_iterations):
            # 生成者每次迭代獲得全新上下文
            output = self.generator.execute(
                subtask=subtask,
                prior_feedback=output.get("feedback") if output else None
            )

            # 評估者獲得全新上下文——只看輸出
            evaluation = self.evaluator.judge(
                output=output["result"],
                criteria=subtask.success_criteria
            )

            if evaluation["passes"]:
                return {"result": output["result"], "passed": True}

            output["feedback"] = evaluation["issues"]

        return {"result": output["result"], "passed": False,
                "feedback": evaluation["issues"]}

    def _assemble(self, results, partial=False):
        assembled = "\n\n".join(r["result"] for r in results.values())
        if partial:
            failed = [k for k, v in results.items() if not v["passed"]]
            assembled += f"\n\n⚠️ Incomplete subtasks: {failed}"
        return assembled
```

## 關鍵要點

1. **長時執行 ≠ 更多時間的短任務執行。** 失敗模式在本質上不同。
2. **上下文焦慮是真實存在的。** 通過重置、壓縮或兩者結合來管理上下文生命週期。
3. **絕不讓生成者批改自己的試卷。** 獨立 Agent、獨立上下文、顯式評分標準。
4. **為一切設定上限。** 最大輪次、最大重新規劃次數、最大迭代次數。無限迴圈燒 Token。
5. **先分解。** 適合 Context Window 大小的塊能在問題出現之前就預防大多數上下文問題。

## 延伸閱讀

- [Context Engineering](context-engineering.md) — 深入探討上下文組裝、壓縮和預算管理
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — 三 Agent 架構之外的編排模式
- [Error Handling](error-handling.md) — Agent 迴圈中的錯誤處理、重試和優雅降級
- [Anthropic: Building effective agents](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/building-effective-agents) — Anthropic 的 Agent 設計模式指南
