---
author: Nexu
---

# 长时运行 Agent Harness 设计

> **Core Insight:** 短任务 Agent 的失败是显式的——要么完成，要么超时。长时运行 Agent 的失败是隐蔽的。它们会产生膨胀的上下文，悄无声息地退化，并在偏离方向的同时说服自己正在出色地工作。设计长时运行 Agent 的 Harness，意味着针对这些失败模式进行防御。

## 为什么长时运行 Agent 很难

"短任务" Agent——回答一个问题、写一个函数、总结一篇文档——在单个 Context Window 内生存和消亡。它要么完成，要么可见地失败。

"长时运行" Agent 运行数小时甚至数天：重构代码库、撰写 50 页报告、运行多阶段流水线。这些 Agent 面临短任务 Agent 从未遇到的问题：

1. **上下文不断累积。** 每次 Tool 调用、每个中间结果、每个推理步骤都会增加 Token。200K 的窗口填满速度比你想象的快。
2. **质量悄然退化。** Agent 不会崩溃——只是变差。回答变得更含糊，指令被遗忘，早期的上下文被挤出。
3. **自我评估在撒谎。** 问一个 Agent "你的工作好吗？"它永远会说"好"。对于一个 30 秒就能目测检查的任务，这没什么问题。但对于一个你没在盯着的 4 小时流水线来说，这是灾难性的。

## 失败模式 #1：上下文焦虑

当长时运行 Agent 填满 Context Window 时，会发生一些反直觉的事情：模型开始赶工。它过早地收尾、偷工减料，在工作实际完成之前就宣布"完成"。

这就是**上下文焦虑**——模型对自己即将用尽空间的隐性感知。表现为：

- 跳过它通常会执行的步骤
- 产出更短、不够深入的输出
- 以"我已经涵盖了要点"过早宣告完成
- 避免会增加更多上下文的 Tool 调用

上下文焦虑在各种架构中普遍存在。模型已经学会对话会结束，当空间缩小时，它倾向于走向结束。

**更大的窗口只是推迟问题，并不能解决它。** 修复之道在于架构层面：显式管理上下文的生命周期。

## 失败模式 #2：自我评估偏差

让生成者评估自己的输出。它会给自己打 8/10 或更高——持续如此，无论实际质量如何。这就是**自我评估偏差**，它是长时运行 Agent 的第二个隐形杀手。

为什么？模型拥有自己推理的完整上下文——每个决策都感觉是合理的。承认失败意味着否定之前的输出，这是 LLM 所抵触的。而且训练数据奖励自信而非自我怀疑。

在短任务中，人类能发现问题。在长时运行任务中，Agent 自主运行。如果它评估自己的输出并总是说"看起来不错"，错误就会不断累积。

```
短任务：   Agent 产出 → 人类审查 → 反馈
长时运行：Agent 产出 → Agent 审查 → "看起来很棒！" → 错误不断累积
```

对抗网络设计中的洞见在这里同样适用：**绝不让生成者批改自己的试卷。**

## 上下文管理：重置 vs. 压缩

当上下文用满时，你有两个选择。每个都有实际的权衡。

### 上下文重置

清空对话，重新开始。将先前工作的摘要作为"简报"传入新的上下文。

```
Turn 1-50:  [完整对话历史]
            ↓ 上下文 80% 已满
Turn 51:    [系统提示 + Turn 1-50 的摘要 + 当前任务]
            ↓ 全新开始，~10% 上下文已用
Turn 51-100: [从摘要继续]
```

**优点：** 清空重来，可预测的 Token 预算，消除新片段的上下文焦虑。

**缺点：** 有损——摘要会遗漏细微差别和失败的方案。"摘要的摘要"在多次重置后会退化。Agent 可能重走死路。

### 上下文压缩

选择性压缩较旧的轮次，同时保持最近的轮次完整。将多轮推理折叠为摘要，丢弃冗长的 Tool 输出。

```
Turn 1-20:  [已压缩：早期探索的 3 行摘要]
Turn 21-40: [已压缩：关键决策和结果]
Turn 41-50: [完整细节：最近进行中的工作]
```

**优点：** 保持连续性。渐进式——最近的轮次保留细节，较旧的轮次压缩。Agent 保留对已尝试过的方案的感知。

**缺点：** 压缩质量参差不齐。实现更复杂。如果摘要与最新状态矛盾，压缩后的上下文可能让模型困惑。

### 如何选择？

| 场景 | 推荐 |
|------|------|
| 有明确阶段的任务（调研 → 写作 → 审查） | 阶段之间重置 |
| 对单一产物的持续迭代 | 压缩 |
| Agent 频繁回顾早期决策 | 压缩（保留决策历史） |
| 上下文已积累大量 Tool 输出 | 重置（Tool 输出压缩效果差） |

实践中，许多 Harness 采用混合方案：阶段内压缩，阶段间重置。

## 生成者-评估者架构

借鉴 GAN 的思路：生成器创造，判别器评判——独立的网络，对立的目标。将同样的原则应用到 Agent 上：

```
┌─────────────┐         ┌──────────────┐
│  生成者      │────────►│  评估者       │
│  (Agent A)  │         │  (Agent B)   │
│             │◄────────│              │
│  产出       │ 反馈    │  评判        │
│  输出       │         │  输出        │
└─────────────┘         └──────────────┘
        │                       │
        │    独立的上下文        │
        │    独立的提示词        │
        │    独立的评判标准      │
```

**关键设计规则：**

1. **独立上下文。** 评估者不看生成者的推理过程——只看其输出。这防止了同情偏差（"我理解你为什么这么做，所以没问题"）。
2. **显式评分标准。** 评估者根据具体的清单打分，而非凭感觉。"代码是否处理了边界情况 X？"优于"代码好不好？"
3. **可操作的反馈。** 评估者返回具体问题，而非分数。"函数 `parse_input` 没有处理空字符串"是有用的。"7/10" 没有用。
4. **迭代预算。** 为生成-评估循环设置上限。没有限制的话，一个完美主义的评估者和一个急切的生成者会永远循环下去。

```python
def generator_evaluator_loop(task, max_iterations=3):
    output = None
    for i in range(max_iterations):
        # 生成者：产出或修改
        if output is None:
            output = generator.run(task)
        else:
            output = generator.revise(task, output, feedback)

        # 评估者：以全新视角评判
        evaluation = evaluator.judge(task, output)  # 没有生成者的上下文！

        if evaluation.passes:
            return output

        feedback = evaluation.issues

    return output  # 达到最大迭代次数后的尽力而为
```

## 三 Agent 架构：规划者 → 生成者 → 评估者

对于复杂的长时运行任务，加入一个**规划者**负责分解、执行和质量控制。

```
                    ┌─────────────┐
                    │   规划者     │
                    │             │
                    │ 将任务分解   │
                    │ 为子任务     │
                    └──────┬──────┘
                           │
                           ▼
              ┌─── 子任务列表 ───┐
              │                    │
              ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  生成者      │      │  生成者      │   （并行或串行）
     │  子任务 1    │      │  子任务 2    │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  评估者      │      │  评估者      │
     │  子任务 1    │      │  子任务 2    │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            └────────┬───────────┘
                     ▼
              ┌─────────────┐
              │   规划者     │
              │  （审查      │
              │   结果，     │
              │   必要时     │
              │   重新规划） │
              └─────────────┘
```

**规划者** — 将目标分解为带有成功标准的子任务。当评估者标记问题时重新规划。持有愿景但不执行。

**生成者** — 每次用全新上下文执行一个子任务。拥有 Tool、文件、执行环境。不评估自己的工作。

**评估者** — 只看到生成者的输出（不看推理过程）。根据规划者的标准打分。返回通过/失败以及具体问题。

关键属性：**每个 Agent 在自己的 Context Window 中运行。** 生成者可以用 200K 窗口来进行代码探索，仍然产出干净的输出。评估者从头开始。规划者保持高层视角，不涉及实现细节。

```python
def three_agent_pipeline(goal, max_replans=2):
    plan = planner.decompose(goal)

    for replan in range(max_replans + 1):
        results = {}
        for subtask in plan.subtasks:
            # 生成者：每个子任务全新上下文
            output = generator.execute(subtask)

            # 评估者：全新上下文，只看输出 + 标准
            evaluation = evaluator.judge(
                subtask=subtask,
                output=output,
                criteria=subtask.success_criteria
            )

            results[subtask.id] = {
                "output": output,
                "evaluation": evaluation
            }

        # 检查所有子任务是否通过
        failures = [r for r in results.values() if not r["evaluation"].passes]
        if not failures:
            return assemble_results(results)

        # 重新规划：规划者看到哪些子任务失败了及原因
        plan = planner.replan(goal, results)

    return assemble_results(results)  # 尽力而为
```

## 反模式

### 反模式 #1：单体 Agent

将规划、执行、评估和上下文管理全塞进一个 Agent。

```python
# 不要这样做
response = llm.chat(
    system="""You are a planner, coder, reviewer, and project manager.
    First plan the work, then do the work, then review your own work.
    If the review finds issues, fix them and review again.""",
    messages=conversation  # 150K Token 的累积历史
)
```

这会因为上述所有原因而失败：上下文填满、自我评估不可靠、没有关注点分离。对简单任务有效，对复杂任务则崩溃。

### 反模式 #2：没有评分标准的评估

```python
# 不要这样做
evaluation = evaluator.judge(
    prompt=f"Is this output good? Rate 1-10.\n\n{output}"
)
# 结果：永远 8/10。永远。
```

没有标准的评估者只是一个有冒名顶替综合症的生成者。始终提供评分标准：

```python
# 应该这样做
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

### 反模式 #3：无限重新规划

```python
# 不要这样做
while not all_subtasks_pass:
    plan = planner.replan(goal, results)  # 永远循环
    results = execute_plan(plan)
```

始终设置迭代上限。三次重新规划失败意味着是规范问题，而不是执行问题。将其交给人类处理。

## 整合：最小实现

```python
class LongRunningHarness:
    """规划者 → 生成者 → 评估者 Harness，用于长时运行任务。"""

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

        # 尽力而为——返回已有结果，标记未完成
        return self._assemble(results, partial=True)

    def _generate_with_eval(self, subtask, max_iterations):
        output = None
        for i in range(max_iterations):
            # 生成者每次迭代获得全新上下文
            output = self.generator.execute(
                subtask=subtask,
                prior_feedback=output.get("feedback") if output else None
            )

            # 评估者获得全新上下文——只看输出
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

## 关键要点

1. **长时运行 ≠ 更多时间的短任务运行。** 失败模式在本质上不同。
2. **上下文焦虑是真实存在的。** 通过重置、压缩或两者结合来管理上下文生命周期。
3. **绝不让生成者批改自己的试卷。** 独立 Agent、独立上下文、显式评分标准。
4. **为一切设置上限。** 最大轮次、最大重新规划次数、最大迭代次数。无限循环烧 Token。
5. **先分解。** 适合 Context Window 大小的块能在问题出现之前就预防大多数上下文问题。

## 延伸阅读

- [Context Engineering](context-engineering.md) — 深入探讨上下文组装、压缩和预算管理
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — 三 Agent 架构之外的编排模式
- [Error Handling](error-handling.md) — Agent 循环中的错误处理、重试和优雅降级
- [Anthropic: Building effective agents](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/building-effective-agents) — Anthropic 的 Agent 设计模式指南
