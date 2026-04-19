---
title: "Initializer + Coding Agent — 一个两阶段 Harness 模式"
author: Nexu
date: "2026-04-19"
description: "为什么带 Compaction 的单 Agent 循环无法构建一个多天的项目，以及把 Harness 拆成 Initializer 阶段和反复运行的 Coding 阶段如何修复它。"
tags: [harness, long-running-agents, context-engineering, patterns]
---

# Initializer + Coding Agent — 一个两阶段 Harness 模式

如果你曾经给一个前沿 Coding 模型喂一个类似 *"给我建一个 Claude.ai 的 clone"* 的 Prompt，然后走开去忙一下午，你就知道这事的结局：一个仓库里有一个能用的登录表单，半个消息列表，文件中间夹着 `TODO: hook up streaming`，以及一条非常自信的 commit message。模型耗尽了 Context。

本能反应是怪模型。其实几乎总是 Harness 的锅。

本文讲的是一个专门修复这类 failure 的模式：**把你的长程 Agent 拆成两个阶段——一个 Initializer 只跑一次，一个 Coding Agent 跑很多次，每个 session 在一张干净的白纸上只做一个 feature。**

它基于 [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)，并引用了 [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)。我想展开讲讲它*为什么*能 work，而不只是它长什么样。

---

## Core insight：Compaction 不够用

对"Context Window 是有限的"这个问题的标准答案是 Compaction。把旧的东西总结一下，保留新的东西，永远循环。

Compaction 对一个两小时的重构没问题。对一个两天的构建就垮了。

把 Opus 4.5 放在 Agent SDK 上，喂它一个高层 Prompt 比如"build a Claude.ai clone"，看看：

- Session 1 写了一大堆代码，撞上 Context 上限时还有一半 feature 没完成。
- Session 2 读一份 Compaction 后的摘要——一个有损的、叙事版本的已发生事情——然后得从中重建意图。
- Session 3 读一份"Compaction 的 Compaction"。信息按几何级衰减。

到 Session 4，模型在跟过去的自己玩传话游戏。它不知道哪些 feature 做完了，哪些做了一半，哪些是它在摘要里幻觉出来的。

**Compaction 是 in-context memory。长程 Agent 需要 out-of-context memory**——文件、结构化状态、git 历史。Agent 在每个 session 都重新读取的东西，而不是靠总结传递下去的东西。

这就是论点。其余都是机械细节。

---

## 你会撞到的两种 failure 模式

在讲模式之前，让我们具体说一下没有这个模式时会出什么错。两种 failure 模式最常见。

### (A) 一气呵成倾向

模型试图在一个 session 里做完所有事。给一个大 Prompt，它写一个大方案。Context 填满了。它继续推。Session 以一堆实现了一半的 feature、散在函数中间的 `// TODO`、一个跑不起来的测试套件、以及没有可回去的干净 commit 结束。模型根本不知道自己坏了——它在能检查之前就把空间耗光了。

### (B) 过早胜利

更狡猾。Session 2 读 Session 1 的进度笔记："implemented login, messaging, streaming."。模型看代码，看到一些*看起来像* login + messaging + streaming 的东西，就宣布项目做完了。它没运行它。它没测试流程。它相信了叙事。

过早胜利是一气呵成的对偶。一气呵成失败是因为模型试图做太多；过早胜利失败是因为下一个模型相信了上一个模型的乐观。任何长程工作的 Harness 都必须**同时**解决这两者。这也是为什么天真的"用 Compaction 循环就好"不够用——Compaction 强化了上一个 session 的叙事，而当叙事过度乐观时，这恰恰是错的方向。

---

## 两阶段 Harness

修复是结构性的。一个 Agent 不再做所有事。你有两个角色，职责不同、生命周期不同。

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

Initializer **只跑一次**。它的工作是把一个模糊的人类简报变成一个具体的、机器可读的计划加一个可运行的脚手架。

Coding Agent **跑很多次**，每次调用都是一个全新的进程，没有上一次的记忆。它通过读取之前 session 写到磁盘上的文件来获得记忆。

两个 Agent，两个目的，一个共享的文件系统。

---

## Initializer Agent

Initializer 是唯一一次性思考整个项目的阶段。在它结束之后，没人再拥有全局视角——每个 Coding session 都在局部工作。

恰好四个产物：

1. **`init.sh`** — 一个脚本，从一次冷 checkout 开始搭起项目：装依赖、跑迁移、后台启动 dev server、打印 URL。每个 Coding session 都先跑它。如果 `init.sh` 坏了，其它的都不重要。
2. **`feature_list.json`** — 分解好的 backlog。格式细节在下一节。
3. **`claude-progress.txt`** — 关于项目进展到哪里、接下来是什么的简短散文笔记。每个 session 结束时更新。
4. **一次初始 git commit** — 脚手架、脚本、feature 列表、进度文件全部在 `HEAD`。从这里开始，每个 session 都以一次 commit 结束。`git log` 是已发货内容的真相来源。

Initializer 不实现 feature。它不挑颜色。它摆好餐桌。

---

## Feature 列表设计：为什么 JSON 胜过 Markdown

"这不就是个 todo 列表吗，为什么不用 Markdown checklist？"

因为当你给 Claude 一个 Markdown 文件时，它把它当作散文。散文是可编辑的。模型会——带着最好的意图——重写你的优先级、改写描述、把两个 feature 合并因为它"感觉更干净"、把一个拆成五个因为它"澄清意图"。Markdown todo 列表对 Agent 来说是流沙。

JSON 不同。模型被训练成把 JSON 当作结构化数据——从中读取和写入特定字段，而不是随意重写的东西。再加上一条明确规则规定只有一个字段可写，JSON 就成了近乎防弹的外部状态。

一个合理的 schema：

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

这种纪律被编码在 Coding Agent 的系统 Prompt 里：

> You may only modify the `passes` field. It is unacceptable to remove or edit tests, acceptance criteria, descriptions, or the structure of this file. If you believe a feature is wrong, stop and report — do not silently rewrite it.

这段措辞不是在兜圈子——它是承重的。"Unacceptable" 对模型读起来是一条硬规则。实践中，它足以让这个文件在几十个 session 里保持稳定。

`passes: false` 是另一个关键细节。这是 Agent 唯一的杠杆。当一个 session 实现了一个 feature、通过了 e2e 测试、干净地 commit 了，它就把这个布尔值翻成 `true`。一个字段——不是散文，不是感觉——就是未来 session 得知什么已经真的做完了的方式。

---

## Coding Agent：一个开机仪式，不是自由发挥

每次 Coding Agent 醒来，它在碰任何代码之前都要跑同样的五步仪式。不可选。

```
1. pwd                         → confirm we're in the project
2. git log --oneline -20       → what shipped, most recent first
   cat claude-progress.txt     → narrative notes from last session
3. cat feature_list.json       → what's done, what's next, what's blocked
4. bash init.sh                → install, migrate, start dev server
5. hit the app in a browser    → verify last session's work still works
```

只有在第 5 步之后，Agent 才挑一个 feature 开始写代码。

把这叫做 **context bootstrap**——Compaction 的 out-of-context 对应物。Agent 不是继承一份摘要，而是从磁盘文件重建它的工作上下文。相同的权威来源，相同的顺序，每个 session。

有几件事值得钉住：

- **git log 在进度笔记之前。** git 是基本真相；进度笔记是乐观的。如果它们不一致，git 赢。
- **`init.sh` 不可协商。** 如果 dev server 起不来，上一个 session 声称的任何东西都不重要。
- **挑新 feature 之前先做 E2E 验证。** 这就是杀死过早胜利的东西。你不信任上一个 session 的"done"——你打开浏览器。

在第 3 步，Agent 挑选*单一、最高优先级、`passes: false` 且所有依赖都已满足的 feature*。不是两个。不是"一组"。一个。然后当那一个变绿并 commit 时就停下。

一 session 一 feature 同时杀死两种 failure 模式：它杀死一气呵成，因为 contract 人为约束了范围；它杀死过早胜利，因为"done"不是自封的——它是一个 e2e 测试在一个清晰界定的单元上通过。

---

## 端到端测试是信任层

单元测试必要但不充分。Coding Agent 写了它们——它不能是唯一检查它们的东西。如果模型误解了规范，单元测试会和实现以同样的形状错，它们会通过，但这不代表任何东西。

端到端是你得到独立信号的地方。把真实的 App 起起来，像用户一样驱动它，看看会发生什么。

实践中这意味着浏览器自动化。[Puppeteer MCP](https://github.com/modelcontextprotocol/servers) 运作良好——Agent 可以导航、填表、点击，并对 DOM 断言。

`auth-01` 的一次验证：

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

三件事：(1) 它跑在 `init.sh` 启动的真实 server 上，不是 mock；(2) 它检查可观测行为——URL、DOM、cookie——不是内部函数；(3) 它便宜到每个 session 都能跑，所以 bootstrap 的"上一个 session 的工作活下来了吗？"检查，也是一次针对已变绿 feature 的 e2e pass。

这就是让 `passes: true` 有意义的东西。

---

## 干净状态 commit：git + 进度文件一起

在每个 Coding session 结束时，有两件事按顺序发生：

1. `git commit -m "feat(auth-01): email+password signup"` — 代码落地。
2. `claude-progress.txt` 被短短地追加一行——发了什么，哪里棘手，下一个 session 应该先看什么。

它们做不同的工作。git 是**真相**层：仅追加、有时间戳、diff 不可协商。`claude-progress.txt` 是**提示**层：给下一个 Agent 的笔记，像"邮件模板住在 `/lib/email/`，我为了测试 monkeypatch 了 SMTP client，注意 `/api/signin` 里有一个 race，我用 retry 绕过去了"。

两者都会在每个 session 开始时被读取。哪一个单独都不够。没有提示的 git 很简短，难以重建意图。没有 git 的提示会漂移。在一起，它们就是取代 Compaction 的 out-of-context memory。

两者都应该以一个*干净*状态结束 session——没有未 commit 的改动，没有写了一半的文件，没有坏掉的 dev server。如果 feature 在 Context 上限之前没做完，**session 回到上一次干净 commit 并报告"未完成"**，而不是 commit 坏掉的工作。这就是你保持 git 可信的方式。

---

## 这个模式适合（和不适合）的场景

在伸手够这个模式之前，对你项目的形状要诚实。

**好的匹配：** Web 应用（feature 可分解，e2e 可测），CLI（每个子命令是一个自然单元），内部工具 / 仪表盘 / 管理面板，有离散阶段的数据管道。

**坏的匹配：** 单算法研究，比如"设计一个更好的 attention 机制"（无法分解成 `passes: true/false`）；高度耦合的代码库，动一个函数会迫使动整个东西；任何价值存在于组件*关系*中的东西——一个编译器的正确性在全局不变量里，而不是"加 lexer" + "加 parser"。

经验法则：如果你能把验收写成"一个用户（或 shell）做 X，观察到 Y"，这个模式 work。否则挑别的 Harness。

---

## 实现草图

Harness driver 本身很小。大部分工作在两个系统 Prompt 里。

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

两件事要内化：**每一次 `run_agent` 调用都是一个全新进程**——没有共享内存，没有共享 Context Window，记忆就是文件系统。**而 driver 是故意笨的**——它不挑 feature、不验证工作、不解释结果。所有的智能都在 Prompt 和产物里。

---

## 结语

这个模式之所以 work，不是因为 Initializer 或 Coding Agent 聪明。它 work 是因为 **"我知道什么？"是由磁盘上的文件回答的，不是由 Context Window 的内容回答的。**

每次你把状态从 in-context 挪到 out-of-context，你都获得了持久性，而且没有失去任何重要的东西。两阶段 Harness 是一种有主张的方式来做这个挪动，应用在跨多个 session 构建软件这个具体问题上。

如果你的长程 Agent 总在"忘事"，修复几乎从来都不是一个更大的 Context Window。是更多的文件。

---

## 延伸阅读

- [scheduling-and-automation.md](./scheduling-and-automation.md) — 如何不靠人类保姆式照看，按时间表唤醒 Coding Agent
- [long-running-harness.md](./long-running-harness.md) — 这个模式所属的更大模式家族
- [memory-and-context.md](./memory-and-context.md) — 对 out-of-context memory、文件布局和 bootstrap 仪式的更深入讲解
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering，原始素材
- [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding) — 两阶段模式的可运行参考实现
