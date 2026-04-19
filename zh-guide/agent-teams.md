---
title: "Agent Teams：并行 Claude 打造真实软件"
author: Nexu
date: "2026-04-19"
description: "一支由 16 个并行 Claude 组成的舰队如何构建了一个 10 万行 Rust C 编译器——以及它给 Harness 设计的启示。"
tags: [agents, harness, parallelism, orchestration, case-study]
---

# Agent Teams：并行 Claude 打造真实软件

大多数 Agent 演示看起来令人印象深刻，但毫无用处。一个 to-do list 应用。一个待办爬虫。一个把三个网页总结一下的"个人研究助手"。

然后有人把 16 个 Claude 接进一个循环，它们构建了一个可以编译 Linux 内核的 C 编译器。

本文讲的就是第二件事——具体来说，它底层的 Harness 长什么样。我们会沿着 Nicholas Carlini 项目 *"Building a C compiler with a team of parallel Claudes"*（[Anthropic Engineering](https://www.anthropic.com/engineering/building-c-compiler)，[GitHub](https://github.com/anthropics/claudes-c-compiler)）的架构走一遍，抽出真正起作用的设计原则，并把它们翻译成你可以在自己 Harness 里复用的模式。

---

## Core Insight

> **16 个 Claude 实例，并行运行约两周，生产出了一个用 Rust 写的 10 万行 C 编译器。它在 x86、ARM 和 RISC-V 上都能编译 Linux 6.9。它通过了 GCC torture test suite 99% 的测试。它能编译 QEMU、FFmpeg、SQLite、Postgres 和 Redis。**

再读一遍。再读一遍。

这不是玩具。这是一个真实的产品级编译器，由一个 LLM 团队在比人类团队能容忍的更严苛的约束下写出来：没有互联网访问，没有现成的 compiler crate，不能从 LLVM 或 tcc 抄代码——只有 Rust 标准库，以及 Claude 从 C 规范和它的训练里能推理出的东西。由 Agent 做的一次洁净室实现。

有意思的问题不是"LLM 能不能写编译器"。我们已经知道它能写*其中一部分*。有意思的问题是：

**什么样的 Harness，能把 16 个无状态、健忘的 LLM 调用，变成一支能交付 10 万行代码的连贯工程团队？**

---

## 项目成绩单

在我们深入架构之前，这里是账本：

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

按业余爱好者的标准，2 万美元的 C 编译器很贵；按编译器团队的标准，便宜得可笑。一个两人的编译器创业公司在三个工作日里就能烧掉 2 万美元。

---

## Ralph-Loop 架构

Harness 的核心尴尬地简单。每个 Agent 都是一个 bash 循环：

```bash
#!/usr/bin/env bash
# agent.sh — run inside a Docker container
while true; do
  claude --dangerously-skip-permissions -p AGENT_PROMPT.md
done
```

就这样。这就是整个 Agent。

没有 Orchestrator。没有任务队列守护进程。没有 Scheduler。没有 Message Bus。当一个 Claude session 结束——成功、失败、或者 Context Window 崩塌——循环就用同一个 Prompt 文件启动一个新的 Claude。Prompt 告诉新的 Claude：去看看仓库，想清楚下一步该做什么，然后去做。

这种风格有时被称为 "Ralph-Loop"（取自 Ralph Wiggum 的 "I'm helping!"）：一个笨笨的外层循环不停地踢一个聪明的内层进程，直到工作完成。

唯一的管理员级干预是：

```bash
# kill the fleet
pkill -9 bash
```

这就是整个关闭协议。没有 graceful drain，没有"请完成你当前的任务"。你 SIGKILL 掉那些 bash 循环，Agent 就在思考一半时死掉。下次你启动它们时，它们会从 `git pull` 留下的位置继续。

### 为什么这能 work

Ralph-Loop 是 Agent 工作的正确形状，有三个原因：

1. **LLM 在不同 session 之间本来就是无状态的。** 假装它们是长期运行的进程，只会把 Context Window 的崩塌藏在越来越绝望的小把戏后面。
2. **重启是免费的。** 一个新的 Claude 去读仓库，比一个已经用 3 小时失败实验填满 Context 的 stale Claude 更便宜。
3. **失败隔离是免费的。** 如果一个 session 跑偏了，下一个 session 不会继承那些废墟——它继承的是 git 状态，那是唯一的真相来源。

---

## 基于 git 的协调（没有 Orchestrator）

这里是大多数人会惊讶的部分：**没有中心 Orchestrator。** 没有东西在分发任务。没有东西知道谁在做什么。没有写着"agent-7 目前在处理 struct-packing"的仪表盘。

相反，舰队通过两个原语协调：

1. 一个 **bare git repo**，每个容器都往里 push 和从里 pull。
2. 一个叫 `current_tasks/` 的目录，里面装着**锁文件**——每个进行中的任务一个，写作 `current_tasks/<task-name>.txt`。

每个 Agent 的 Prompt 实际上在告诉它：

> "看一下开放的 TODO、失败的测试和进度文件。挑一个当前没人在做的最显而易见的下一件事。为它放一个锁文件。做这份工作。commit。移除锁。退出。"

下面是每个 session 的生命周期：

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

### 竞态，以及为什么 git 赢

两个 Agent 同时醒来。它们都看开放任务。它们都认定最显而易见的事是"修 codegen/x86.rs 里的 segfault"。它们都写了 `current_tasks/fix-segfault-x86.txt`。它们都 `git push`。

一个 push 赢。另一个 push 被拒——`non-fast-forward`。那个 Agent 做 `git pull --rebase`，看到锁已经存在，意识到自己迟到了，就去挑另一个任务。

这就是关键动作：**git 的并发模型就是 Agent 团队的并发模型。** 锁、合并、冲突解决——这些都是免费的，因为 git 已经解决了它们。你不用在你的 LLM 之上搭一篇分布式系统论文；你从 2005 年继承了一篇。

---

## 设计原则 1：为 Claude 写测试，不是为你自己写

这是我想纹在每个构建 Agent Harness 的人脑门上的教训。

当一个人类读一个失败的测试时，他免费得到了很多：他可以扫一眼 500 行输出，注意到一个可疑的模式，在脑子里保持一个假设，然后去调试。循环中的 LLM 这些事都做不好。你的测试 Harness 必须按它的限制来设计，不是按你的。

### Context Window 污染

大多数测试运行器的默认行为是"把所有东西都 dump 到 stdout"。那对于在终端里滚动的人类来说没问题；对于 Claude 来说是灾难性的。一千行测试输出会吃掉 Context Window，到 Claude 开始推理这个 bug 时，它已经忘了 Prompt。

**修复**：让测试 Harness 默认极度简洁，把详细输出送到文件。

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

现在 Claude 看到的是：

```
PASS  tests/struct_layout_01
PASS  tests/struct_layout_02
ERROR tests/struct_layout_03  see logs/struct_layout_03.log
PASS  tests/struct_layout_04
```

Claude 可以在整个运行里 `grep ERROR`，挑一个 failure，然后只 `cat` 相关的那个 log。Context 保持小。注意力保持聚焦。

### `ERROR` 标记

注意那个字面量 `ERROR`。那是刻意的。一个一致的、可 grep 的标记，是任何 Agent Harness 里投入回报率最高的约定之一。它意味着 Claude 可以用一个 `grep -l ERROR logs/` 浏览成千上万条测试结果。不要在一个地方写"failed"，在另一个地方写"FAIL"，在第三个地方写"❌"。选一个。到处都用它。

### 时间盲

Claude 没有挂钟。它无法分辨"这个测试慢"和"这个测试卡死了"。如果你让一个 Agent 每个 session 都跑完整测试套件，你一半的 Agent 会在那里坐 40 分钟，判定啥事没发生，杀掉测试套件，然后去做一些狂野的重构。

**修复**：加一个 `--fast` 子采样模式，按 Agent 确定性地跑 1–10% 的测试：

```python
def select_tests(all_tests: list[str], agent_id: str, fraction=0.05):
    # Same agent → same subsample within a session.
    # Different agents → different subsamples, so the fleet covers
    # more ground than any single agent does.
    rng = seeded_random(agent_id)
    k = max(1, int(len(all_tests) * fraction))
    return rng.sample(all_tests, k)
```

这里有两个属性很重要：

- **每个 Agent 内部确定性**：同一个 Agent 跑同一个命令两次，看到的结果一样。否则 Claude 就无法推理自己的改动是否修好了什么东西。
- **跨舰队不同**：每个 Agent 探测测试套件的不同角落，他们的并集覆盖度比任何单个 Agent 都高得多。

### 进度文件与 README

唯一的长寿命记忆是文件系统。Carlini 的 Agent 维护：

- 每个模块顶部的 `README.md`：*这个模块是做什么的，什么在 work，什么不 work*。
- `PROGRESS.md` 和按区域的进度文件：*尝试过什么，失败过什么，当前的理论是什么*。

这些不是给人类看的。它们是给下一个醒来的 Claude 看的。当你把进度文件当作**给未来自己的信息**，它们就成了仓库里最有价值的产物。

---

## 设计原则 2：并行友好的任务分解

并行不是关于你的团队的事实。它是关于你*工作*的事实。

### 简单模式：很多独立的失败

Agent 团队的快乐情形，是一个有很多独立失败测试的测试套件。200 个失败测试，16 个 Agent，每个 Agent 抓一个，修好它，commit，继续。冲突最少。线性扩展。大家都高高兴兴回家。

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

### 困难模式：一个单体的构建

现在设想目标是：*编译 Linux 内核*。只有一个任务。一个构建。一个失败的产物。16 个 Agent 全都开始读内核源码、提修复方案。它们互相覆盖。它们在 bug 该修在 parser 里还是 codegen 里上意见不合。仓库变成一场汽车拆毁大赛。

更多 Agent 现在*更糟*。把更多 Claude 扔到一个不可分割的单体问题上，就是在一个下午烧掉 2 万美元、什么也拿不出的方式。

修复不是"加一个 Orchestrator"。修复是**把单体分解为独立的失败**。这就把我们引向了整个项目里最聪明的一个点子。

---

## GCC 作为 Oracle：对内核做二分

当团队试图用他们的新编译器编译 Linux 内核时，东西以壮观而缠绕的方式崩了。几百个文件共同导致了一个坏镜像。没人——不是 Claude，也不是人类——能看着"内核不启动"，告诉你 2 万个 C 文件里的哪一个暴露了 bug。

关键动作：**把 GCC 当作已知好的 Oracle，让 Claude 只编译一个子集**。

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

伪代码：

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

一旦你把 bug 定位到一个文件，你就完成了关键一步：你把一个单体失败转化成了一个**独立的、可复现的测试用例**。现在你又回到了简单模式——一个具体的失败测试，一个 Claude 就能独立解决。

这个模式的通用形状：

> **当一个任务太大以至于无法并行化，就找一个可信的 Oracle，让大部分工作通过 Oracle 跑，让你的 Agent 在一个不断缩小的子集上慢慢啃，直到剩下的每个 failure 都是局部的。**

这是一个 Harness 设计模式，不是编译器模式。它适用于任何你有一个带有可信参照的单体系统的场景——数据管道、模型训练子组件、配置生成、甚至 UI 渲染。

---

## Agent 角色特化

所有 16 个 Agent 都是同一个 Claude 二进制，但它们的 Prompt 给了它们不同的*工作*。这听起来是件小事；它不是。给每个 Agent 一个独特的角色，大大减轻了"所有人围着同一个 failure 挤"的病态。

项目中的五个角色，改述如下：

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

角色分离之所以重要，是因为它**改变了一个 Agent 认为哪些任务是"最显而易见的"**。一个 `design-critic` 看仓库时看到的"下一件事"，和一个 `performance-tuner` 看同一个仓库看到的不一样。舰队在没有任何中心 Scheduler 决定谁做什么的情况下，覆盖了更多的工作面。

对你自己的 Harness 而言，一般规则是：**如果两个 Agent 一直在撞车，通常是因为它们的 Prompt 没有区分什么叫"显而易见的下一步"。**

---

## 什么时候不该搭一个 Agent Team

文章诚实的部分。Agent Team 昂贵、笨拙、偶尔有魔法。它们对大多数工作都不是合适的工具。如果下面任何一条成立，*不要*搭：

- **项目小。** 如果单个聚焦的 Claude session 能一次过完成任务，一个 16 Agent 的舰队只会产生协调开销、合并冲突，以及一个 5 美元活儿的 500 美元账单。一把锋利的刀胜过十六把钝刀。
- **工作需要紧密协调。** 涉及大量横切决定的设计——API schema、协议不变量、共享数据模型——会被并行 Agent 摧毁。Agent 擅长"去修这个失败的测试"。它们不擅长"我们来商量一下错误类型层级应该长什么样"。
- **你没有一个好的测试 Oracle。** 编译器有 GCC torture test suite 和一个要么启动要么不启动的内核。大多数软件没有一个可信的、可自动化的、确定性的"它 work 了吗？"信号。没有它，你的 Agent 优化的是验证器检查的东西，而不是你真正想要的东西——由于验证器是不完美的，它们会朝错误的方向优化。
- **你不能便宜地重启。** Ralph-Loop 假设重启是免费的。如果你的 Agent 要预热 30 分钟才能开始有用工作，循环的摊销就很差，舰队会输给一个长寿命的进程。

如果任何一条成立，就用一个 Claude 加一个好 Prompt，停手。

---

## 这给 Harness 构建者的启示

从这个具体项目抽离出来，有五个想法可以干净地迁移：

1. **git 是 Agent 协调的原语。** 别搭任务队列、锁服务、Message Bus。用 git。锁、合并、冲突解决、历史、回滚——你全都免费获得，而且是被已经认真思考过并发的人们设计的。
2. **测试套件的质量是 Agent 能力的天花板。** Claude 只能和你给它的信号一样好。不成比例地投入测试、Oracle 和验证器。一个有好测试套件的平庸 Agent，每一次都胜过一个有平庸测试套件的出色 Agent。
3. **为 Claude 设计 Harness，不是为你。** 默认简洁输出。`ERROR` 标记。完整日志入文件。确定性子采样。进度文件作为给未来 session 的信件。每一条的存在，都是因为 Agent 和你不一样——更健忘、更易分心、对时间盲。
4. **用已知好的 Oracle 分解单体。** 当问题抵抗并行，不要加更多 Agent；加一个可信参照，让大部分工作通过它跑，让 Agent 攻击一个缩小的残余。GCC-as-oracle 是一个通用模式。
5. **通过 Prompt 做特化。** 同一个模型，不同工作。让 16 个 Agent 互不踩踏的最便宜、最好扩展的方式，就是给它们不同的"显而易见下一步"的定义。

2 万美元的账单买了一个编译器。免费的赠品是一份 Agent Team 起作用时的工作蓝图。

---

## 延伸阅读

本指南内：

- [multi-agent-orchestration.md](./multi-agent-orchestration.md) — 超越 Ralph-Loop 的 Agent 舰队协调模式。
- [sandbox.md](./sandbox.md) — 用 Docker 和 bare git 仓库做每 Agent 隔离。
- [sub-agent.md](./sub-agent.md) — 什么时候生成 sub-agent 而不是往舰队里加同伴。

外部：

- Nicholas Carlini / Anthropic Engineering — [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- [anthropics/claudes-c-compiler](https://github.com/anthropics/claudes-c-compiler) — 实际的仓库，Harness 和一切。读 Prompt。Prompt 就是产品。
