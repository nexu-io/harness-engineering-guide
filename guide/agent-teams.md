---
title: "Agent Teams: Parallel Claudes Building Real Software"
author: Nexu
date: "2026-04-19"
description: "How a fleet of 16 parallel Claude agents built a 100K-line Rust C compiler — and what it teaches us about harness design."
tags: [agents, harness, parallelism, orchestration, case-study]
---

# Agent Teams: Parallel Claudes Building Real Software

Most agent demos look impressive and do nothing useful. A to-do list app. A
todo scraper. A "personal research assistant" that summarizes three web pages.

Then somebody plugs sixteen Claudes into a loop and they build a C compiler
that can compile the Linux kernel.

This article is about that second thing — and specifically, what the harness
underneath it looked like. We'll walk through the architecture from Nicholas
Carlini's project *"Building a C compiler with a team of parallel Claudes"*
([Anthropic Engineering](https://www.anthropic.com/engineering/building-c-compiler),
[GitHub](https://github.com/anthropics/claudes-c-compiler)), pull out the
design principles that actually mattered, and translate them into patterns
you can reuse in your own harness.

---

## The Core Insight

> **16 Claude instances, running in parallel for about two weeks, produced
> a 100,000-line C compiler written in Rust. It compiles Linux 6.9 on x86,
> ARM, and RISC-V. It passes 99% of the GCC torture test suite. It compiles
> QEMU, FFmpeg, SQLite, Postgres, and Redis.**

Read that again. Then read it once more.

This is not a toy. This is a real production-grade compiler, written by a
team of LLMs under constraints much tighter than a human team would tolerate:
no internet access, no existing compiler crates, no copying from LLVM or
tcc — only the Rust standard library and whatever Claude could reason out
from the C spec and its training. A clean-room implementation done by
agents.

The interesting question isn't "can an LLM write a compiler." We already
knew it could write *parts* of one. The interesting question is:

**What harness turns 16 stateless, forgetful LLM calls into a coherent
engineering team that ships 100,000 lines of code?**

---

## Project Scorecard

Before we dig into the architecture, here's the ledger:

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

$20K for a C compiler is expensive by hobbyist standards and laughably
cheap by compiler-team standards. A two-person compiler startup burns
$20K in three working days.

---

## The Ralph-Loop Architecture

The heart of the harness is embarrassingly simple. Each agent is a bash
loop:

```bash
#!/usr/bin/env bash
# agent.sh — run inside a Docker container
while true; do
  claude --dangerously-skip-permissions -p AGENT_PROMPT.md
done
```

That's it. That's the whole agent.

No orchestrator. No task queue daemon. No scheduler. No message bus.
When one Claude session finishes — success, failure, or context-window
collapse — the loop starts a fresh Claude with the same prompt file.
The prompt tells the new Claude to go look at the repo, figure out what
needs doing next, and do it.

This style is sometimes called a "Ralph loop" (after Ralph Wiggum's
"I'm helping!"): a dumb outer loop keeps kicking a smart inner process
until the work is done.

The only supervisor-level intervention is:

```bash
# kill the fleet
pkill -9 bash
```

That's the entire shutdown protocol. There is no graceful drain, no
"please finish your current task." You SIGKILL the bash loops and the
agents die mid-thought. Next time you start them, they pick up from
wherever `git pull` left them.

### Why this works

A Ralph loop is the right shape for agent work for three reasons:

1. **LLMs are stateless between sessions anyway.** Pretending they're
   long-running processes only hides context-window collapse behind
   increasingly desperate tricks.
2. **Restart is free.** A fresh Claude reading the repo is cheaper than
   a stale Claude that has filled its context with 3 hours of failed
   experiments.
3. **Failure isolation comes for free.** If a session goes off the rails,
   the next session doesn't inherit the wreckage — it inherits the git
   state, which is the only source of truth.

---

## Git-Based Coordination (No Orchestrator)

Here's the part that surprises most people: **there is no central
orchestrator.** Nothing is handing out tasks. Nothing knows who's doing
what. There is no dashboard with "agent-7 is currently working on
struct-packing."

Instead, the fleet coordinates through two primitives:

1. A **bare git repo** that each container pushes to and pulls from.
2. A directory called `current_tasks/` containing **lock files** — one
   per in-progress task, written as `current_tasks/<task-name>.txt`.

Every agent's prompt tells it, in effect:

> "Look at the open TODOs, failing tests, and progress files. Pick the
> next most obvious thing nobody is currently working on. Drop a lock
> file for it. Do the work. Commit. Remove the lock. Exit."

Here's the per-session lifecycle:

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

### The race, and why git wins

Two agents wake up at the same time. Both look at the open tasks. Both
decide the most obvious thing is "fix the segfault in codegen/x86.rs".
Both write `current_tasks/fix-segfault-x86.txt`. Both `git push`.

One push wins. The other push is rejected — `non-fast-forward`. That
agent does `git pull --rebase`, sees that the lock already exists,
realizes it was late to the party, and goes pick a different task.

This is the move: **git's concurrency model is also the agent team's
concurrency model.** Locks, merges, and conflict resolution are all
free because git already solves them. You don't build a distributed
systems paper on top of your LLMs; you inherit one from 2005.

---

## Design Principle 1: Write Tests for Claude, Not for Yourself

This is the lesson I'd tattoo on the forehead of anyone building
agent harnesses.

When a human reads a failing test, they get a lot for free: they can
glance at 500 lines of output, notice a suspicious pattern, hold a
hypothesis in their head, and go debug. An LLM in a loop can do none
of those things well. Your test harness has to be designed for its
limitations, not yours.

### Context-window pollution

The default behavior of most test runners is "dump everything to stdout."
That's fine for a human scrolling in a terminal; it's catastrophic for
Claude. A thousand lines of test output will chew through the context
window, and by the time Claude is reasoning about the bug, it has
forgotten the prompt.

**Fix**: make the test harness extremely terse by default, and send
verbosity to files.

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

Now Claude sees:

```
PASS  tests/struct_layout_01
PASS  tests/struct_layout_02
ERROR tests/struct_layout_03  see logs/struct_layout_03.log
PASS  tests/struct_layout_04
```

Claude can `grep ERROR` across the run, pick one failure, then `cat`
only the relevant log. Context stays small. Attention stays focused.

### The `ERROR` marker

Notice that `ERROR` literal. That's deliberate. A consistent, greppable
marker is one of the highest-ROI conventions in any agent harness. It
means Claude can navigate thousands of test results with a single
`grep -l ERROR logs/`. Don't write "failed" in one place and "FAIL" in
another and "❌" in a third. Pick one. Put it everywhere.

### Time blindness

Claude has no wall clock. It cannot tell the difference between "this
test is slow" and "this test is hung." If you let an agent run the
full test suite every session, half your agents will sit there for
40 minutes, decide nothing is happening, kill the suite, and try some
wild refactor.

**Fix**: add a `--fast` subsample mode that runs 1–10% of tests,
chosen deterministically per agent:

```python
def select_tests(all_tests: list[str], agent_id: str, fraction=0.05):
    # Same agent → same subsample within a session.
    # Different agents → different subsamples, so the fleet covers
    # more ground than any single agent does.
    rng = seeded_random(agent_id)
    k = max(1, int(len(all_tests) * fraction))
    return rng.sample(all_tests, k)
```

Two properties matter here:

- **Deterministic per agent**: the same agent running the same command
  twice sees the same results. Otherwise Claude can't reason about
  whether its change fixed anything.
- **Different across the fleet**: each agent probes a different
  corner of the test suite, and the union of their coverage is much
  higher than any single agent's.

### Progress files and READMEs

The one long-lived piece of memory is the filesystem. Carlini's agents
maintain:

- `README.md` at the top of each module: *what does this do, what's
  working, what's not*.
- `PROGRESS.md` and per-area progress files: *what has been attempted,
  what failed, what the current theory is*.

These are not for humans. They are for the next Claude that wakes up.
When you treat progress files as **messages to future you**, they
become the most valuable artifact in the repo.

---

## Design Principle 2: Parallel-Friendly Task Decomposition

Parallelism is not a fact about your team. It is a fact about your
*work*.

### Easy mode: many independent failures

The happy case for an agent team is a test suite with lots of
independent failing tests. 200 failing tests, 16 agents, each agent
grabs one, fixes it, commits, moves on. Minimal conflict. Linear
scaling. Everyone goes home happy.

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

### Hard mode: one monolithic build

Now imagine the goal is: *compile the Linux kernel*. There's one task.
One build. One failing artifact. 16 agents all start reading kernel
source and proposing fixes. They overwrite each other. They disagree
about whether to fix the bug in the parser or the codegen. The repo
becomes a demolition derby.

More agents is now *worse*. Throwing more Claudes at a single
indivisible problem is how you burn $20K in an afternoon with nothing
to show for it.

The fix is not "add an orchestrator." The fix is **decompose the
monolith into independent failures**. Which brings us to the single
cleverest idea in the whole project.

---

## GCC-as-Oracle: Bisecting the Kernel

When the team tried to compile the Linux kernel with their new
compiler, things broke in spectacular, tangled ways. Hundreds of files
contributed to a single broken image. Nobody — not Claude, not a
human — could look at "the kernel didn't boot" and tell you which of
the 20,000 C files exposed the bug.

The move: **use GCC as a known-good oracle and let Claude compile only
a subset**.

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

Pseudocode:

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

Once you've localized the bug to one file, you've done the critical
step: you've converted a monolithic failure into an **independent,
reproducible test case**. Now you're back in easy mode — a specific
failing test that one Claude can own.

The general shape of this pattern:

> **When a task is too big to parallelize, find a trusted oracle, run
> most of the workload through the oracle, and let your agents chip
> away at a shrinking subset until each remaining failure is local.**

This is a harness-design pattern, not a compiler pattern. It applies
to anything where you have a monolithic system with a trusted
reference — data pipelines, model training subcomponents, config
generation, even UI rendering.

---

## Agent Role Specialization

All 16 agents are the same Claude binary, but their prompts give them
different *jobs*. This sounds like a small thing; it is not. Giving
each agent a distinct role drastically reduces the "everyone crowds
around the same failure" pathology.

Five roles from the project, paraphrased:

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

Role separation matters because it **changes which tasks an agent
considers "most obvious."** A `design-critic` looking at the repo sees
different "next work" than a `performance-tuner` looking at the same
repo. The fleet covers more of the work surface without any central
scheduler deciding who does what.

For your own harness, the general rule is: **if two agents keep
colliding, it's usually because their prompts don't differentiate
what "obvious next step" looks like.**

---

## When Not to Build an Agent Team

The honest part of the article. Agent teams are expensive, awkward,
and occasionally magical. They are not the right tool for most work.
Do *not* build one if any of these hold:

- **The project is small.** If a single focused Claude session can
  finish the task in one pass, a fleet of 16 is going to produce
  coordination overhead, merge conflicts, and a $500 bill for a
  $5 job. One sharp knife beats sixteen dull ones.
- **The work requires tight coordination.** Designs with lots of
  cross-cutting decisions — API schemas, protocol invariants, shared
  data models — get destroyed by parallel agents. Agents are good at
  "go fix this failing test." They are bad at "let's agree on what
  the error type hierarchy should be."
- **You do not have a good test oracle.** A compiler has the GCC
  torture test suite and a kernel that either boots or doesn't.
  Most software does not have a trusted, automatable, deterministic
  "did it work?" signal. Without that, your agents optimize for what
  the verifier checks, not for what you actually want — and since
  the verifier is imperfect, they optimize for the wrong thing.
- **You cannot restart cheaply.** Ralph loops assume restart is free.
  If your agents have to warm up for 30 minutes before doing useful
  work, the loop amortizes badly and the fleet underperforms a
  single long-lived process.

If any of those apply, use one Claude with a good prompt and stop.

---

## What This Teaches Harness Builders

Stepping back from the specific project, five ideas transfer cleanly:

1. **Git is the agent coordination primitive.** Don't build a task
   queue, a lock service, a message bus. Use git. Locks, merges,
   conflict resolution, history, rollback — you get them all for
   free, and they were designed by people who already thought hard
   about concurrency.
2. **Test-suite quality is the ceiling on agent capability.** Claude
   can only be as good as the signal you give it. Invest
   disproportionately in tests, oracles, and verifiers. A mediocre
   agent with a great test suite beats a great agent with a mediocre
   test suite every single time.
3. **Design the harness for Claude, not for you.** Terse default
   output. `ERROR` markers. Full logs to files. Deterministic
   subsampling. Progress files as letters to future sessions. Every
   one of these exists because the agent is different from you —
   more forgetful, more easily distracted, blind to time.
4. **Decompose monoliths with known-good oracles.** When a problem
   resists parallelism, don't add more agents; add a trusted
   reference, run the bulk of the work through it, and let the
   agents attack a shrinking residual. GCC-as-oracle is a general
   pattern.
5. **Specialize through prompts.** Same model, different jobs. The
   cheapest and best-scaling way to make 16 agents not step on each
   other is to give them different definitions of "obvious next
   step."

The $20,000 bill paid for a compiler. The free bonus was a blueprint
for how agent teams work when they work.

---

## Further Reading

Inside this guide:

- [multi-agent-orchestration.md](./multi-agent-orchestration.md) —
  patterns for coordinating agent fleets beyond Ralph loops.
- [sandbox.md](./sandbox.md) — per-agent isolation with Docker and
  bare git repos.
- [sub-agent.md](./sub-agent.md) — when to spawn a sub-agent instead
  of adding another peer to the fleet.

External:

- Nicholas Carlini / Anthropic Engineering — [Building a C compiler
  with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- [anthropics/claudes-c-compiler](https://github.com/anthropics/claudes-c-compiler)
  — the actual repo, harness and all. Read the prompts. They are the
  product.
