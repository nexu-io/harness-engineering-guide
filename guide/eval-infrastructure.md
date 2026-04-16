---
title: "Infrastructure Noise in Agent Evaluations"
description: "Why CPU, RAM, and timeout settings can swing agentic benchmark scores by more than the gap between top models — and what to do about it."
author: Nexu
date: 2026-04-16
tags: [evals, infrastructure, agentic-benchmarks, harness-engineering]
---

# Infrastructure Noise in Agent Evaluations

You upgrade your model. Your SWE-bench score jumps two points. Celebration?

Maybe. Or maybe you just gave the eval container an extra CPU core.

Recent work from Anthropic's engineering team puts hard numbers on something harness builders have long suspected: **infrastructure configuration can swing agentic benchmark scores by up to 6 percentage points** — often more than the gap separating top models on public leaderboards. This finding should change how every evaluation team thinks about their harness setup.

This guide breaks down the problem, walks through the data, and offers concrete advice for configuring eval environments that measure model capability rather than infrastructure luck.

---

## Why Agentic Evals Are Not Static Benchmarks

A traditional benchmark — MMLU, HumanEval, HellaSwag — is essentially a function call. You send a prompt, you get a completion, you score it. The compute environment barely matters. A 2-core VM and a 64-core workstation produce identical scores because the model's inference is handled by a remote API and the local machine just orchestrates I/O.

Agentic evaluations break this assumption completely.

When an agent tackles a SWE-bench task, it doesn't just generate a patch. It:

- **Spawns processes** — linters, test runners, build tools, sometimes multiple in parallel.
- **Reads and writes files** — navigating large repositories, grepping through thousands of lines.
- **Iterates** — running tests, reading failures, editing code, running tests again.
- **Manages time** — deciding when to abandon a strategy and try something else.

Every one of these steps depends on the runtime environment. A test suite that finishes in 8 seconds on a fast machine might take 90 seconds on a throttled container. An agent that gets killed after 5 minutes of wall-clock time will solve fewer problems than one allowed 30 minutes — not because the model is worse, but because the clock ran out.

**The runtime environment is part of the test.** This is the fundamental difference. In static benchmarks, infrastructure is background plumbing. In agentic evals, infrastructure is an experimental variable.

---

## The Hidden Impact of Resource Enforcement

Not all resource limits are created equal. Two harnesses can both advertise "4 GB RAM limit" and produce meaningfully different scores, depending on *how* that limit is enforced.

### Guaranteed Allocation vs. Hard Kill

Consider two enforcement strategies:

| Strategy | What Happens at 4 GB |
|---|---|
| **Guaranteed allocation** | The container is *guaranteed* 4 GB. It may occasionally burst above if the host has headroom. Processes slow down under memory pressure but keep running. |
| **Hard kill threshold** | The moment the container touches 4 GB, the OOM killer fires. The agent's process tree dies. Task fails. |

Same nominal limit. Very different outcomes.

Under guaranteed allocation, an agent that briefly spikes to 4.2 GB while running a test suite will survive — the host absorbs the burst, the test finishes, the agent reads the output and continues. Under a hard kill, that same spike is a task failure. The agent never gets a chance to recover.

### CPU: Shares vs. Pinning

A similar split exists for CPU:

- **CPU shares** (e.g., Docker `--cpu-shares`) provide proportional access. If the host is idle, your container gets all the cores it wants. If the host is loaded, you get your fair share. Scores become dependent on what *else* is running on the machine.
- **CPU pinning** (e.g., `--cpuset-cpus=0-3`) dedicates specific cores. Deterministic, but wasteful if the agent's workload is bursty.

If your eval cluster uses CPU shares and runs multiple evals in parallel on the same host, you've introduced a hidden correlation between tasks. Agent A's score depends on whether Agent B happened to be running a compile job at the same time.

### Time Limits: Wall Clock vs. CPU Time

Most harnesses enforce a wall-clock timeout per task. But wall-clock time is a joint function of model capability *and* infrastructure speed.

An agent that generates an efficient plan but runs on a slow machine might time out. The same agent on faster hardware finishes with minutes to spare. The model didn't change. The score did.

This is why infrastructure configuration is not a footnote. **It's a first-class experimental variable.**

---

## The Data: What Happens When You Scale Resources

Anthropic's team ran a controlled experiment: take the same model, the same agent scaffold, the same task set, and vary only the infrastructure allocation. They tested three tiers:

- **1x** — a constrained baseline (representative of minimal CI configurations).
- **3x** — three times the CPU and RAM of the baseline.
- **Uncapped** — no artificial resource limits.

The results split cleanly into two regimes.

### 1x → 3x: Eliminating Infrastructure Errors

Tripling resources from the baseline primarily **reduced infrastructure-induced failures**. The infrastructure error rate dropped from approximately 5.8% to 2.1%.

These are tasks where the agent's approach was on the right track, but the environment killed it — OOM, timeout, disk full. At 3x, those failure modes mostly disappear.

Critically, the overall benchmark score change between 1x and 3x was **within the range of normal run-to-run variance**. In other words, the score delta was indistinguishable from noise.

What does this mean? Below a certain resource threshold, score differences between configurations (or between runs) are largely measuring **how often the infrastructure gets in the way**, not how capable the model is.

### 3x → Uncapped: Agents Exploit Extra Resources

Removing resource limits entirely told a different story. Scores rose **significantly** — well beyond the noise floor.

With unlimited resources, agents exhibited qualitatively different behavior:

- **More aggressive exploration.** Agents ran larger test suites, tried more fix strategies in parallel, and iterated more times before giving up.
- **Heavier tool use.** Without worrying about memory, agents could hold more context — larger file reads, more extensive grep results, bigger diffs.
- **Longer reasoning chains.** Without a tight wall-clock limit, agents could afford to "think longer" — trying a strategy, failing, backtracking, and trying another.

The extra resources didn't just prevent failures. They **expanded the set of problems the agent could solve** by enabling strategies that were infeasible under constrained budgets.

### The 6-Point Swing

Across the full range from 1x to uncapped, the score difference reached approximately **6 percentage points**. For context, on recent SWE-bench leaderboards, the gap between the #1 and #5 ranked systems is often smaller than this.

This means a harness configuration choice — something that might be decided by a DevOps engineer picking a container size — can have more impact on the published score than the actual model improvements being evaluated.

---

## Implications for Harness Engineering

If you're building or maintaining an eval harness, this data demands a shift in how you think about resource configuration.

### Resource Config Is a Design Decision, Not a Default

Most teams treat infrastructure setup as an operational detail. Someone picks a container size that "seems reasonable," and it never gets revisited. The Anthropic findings show this is equivalent to choosing your test's difficulty level without documenting it.

Every resource parameter — CPU count, RAM ceiling, disk space, wall-clock timeout, network bandwidth — is an **axis of your evaluation's design space**. It should be:

- **Documented** in the eval specification.
- **Version-controlled** alongside the task definitions and scoring logic.
- **Reported** in any published results.

### Below 3x, You're Measuring Infrastructure

If your eval environment is resource-constrained (which most CI-based setups are), a significant fraction of task failures may be infrastructure artifacts rather than model limitations.

Before interpreting a score drop as a model regression, ask:

- Did the container OOM on any tasks?
- Did any tasks hit the wall-clock timeout?
- Are you running multiple evals on the same host with shared CPU?

If the answer to any of these is "yes" or "I don't know," your signal-to-noise ratio may be worse than you think.

### Comparisons Require Identical Infrastructure

This sounds obvious but is routinely violated. Two teams evaluating on "SWE-bench" with different container sizes, different CPU allocations, and different timeout values are not running the same benchmark. Their scores are not directly comparable.

If your harness doesn't pin and report the exact infrastructure spec, **cross-team comparisons are unreliable.**

---

## Practical Advice: Configuring Your Eval Environment

Based on the data and the principles above, here's a concrete framework for setting up infrastructure that measures what you actually care about.

### 1. Specify a Floor and a Ceiling

Don't use a single resource value. Define two:

- **Floor (minimum guaranteed):** The resources that are always available to the agent, no matter what else is happening on the host. This prevents infrastructure starvation from corrupting your results.
- **Ceiling (burst limit):** The maximum resources the agent can access during transient spikes. This prevents a single runaway process from destabilizing the host.

For example:

```yaml
resources:
  cpu:
    floor: 4 cores (guaranteed)
    ceiling: 8 cores (burstable)
  memory:
    floor: 8 GB (guaranteed)
    ceiling: 16 GB (hard limit, OOM above this)
  timeout:
    per_task: 30 minutes (wall clock)
  disk:
    floor: 20 GB
```

The floor ensures reproducibility. The ceiling prevents runaway costs. Together, they define the eval's "infrastructure contract."

### 2. Set the Floor at 3x Your Minimum Viable Config

The data suggests that below ~3x the minimum configuration, you're primarily measuring infrastructure noise rather than model capability. Use this as a rule of thumb:

1. Find the **minimum config where a known-good agent can complete the median task** without resource errors.
2. **Multiply by 3.** That's your floor.

This doesn't guarantee zero infrastructure noise, but it pushes the noise floor low enough that score differences are more likely to reflect genuine capability gaps.

### 3. Monitor Infrastructure Failures Separately

Track these metrics per eval run:

- **OOM kill count** — how many tasks died from memory exhaustion.
- **Timeout count** — how many tasks hit the wall-clock limit.
- **Disk full count** — how many tasks ran out of disk space.
- **Infrastructure error rate** — (OOM + timeout + disk full) / total tasks.

Report the infrastructure error rate alongside the benchmark score. If it's above 2-3%, your results are contaminated. Fix the infrastructure before interpreting the model signal.

### 4. Isolate Eval Runs

Don't share hosts between concurrent eval runs unless you're using hard resource isolation (cgroups with guaranteed allocations, not just CPU shares).

Better yet: **one eval run, one machine** (or one dedicated VM / pod). The marginal cost of a dedicated instance is trivial compared to the cost of debugging a phantom score regression that turns out to be noisy neighbors.

### 5. Version Your Infrastructure Spec

Add the infrastructure configuration to your eval's version-controlled specification:

```
eval-spec/
├── tasks/
├── scoring/
├── scaffold/
└── infrastructure.yaml    ← This is new. Treat it as mandatory.
```

When you publish results, include the infrastructure spec. When you compare runs, diff the infrastructure spec first.

### 6. Run Infrastructure Sensitivity Checks

Periodically (at least once per quarter or whenever you change the eval environment), run the same model at 1x, 3x, and uncapped resources. Compare:

- If 1x and 3x scores differ by more than your typical run-to-run variance, your floor is too low.
- If 3x and uncapped scores are similar, your 3x config is sufficient to capture the model's capability on this task set.
- If 3x and uncapped still diverge, some tasks genuinely require more resources — consider whether those tasks are testing model capability or infrastructure capacity.

---

## The Bigger Picture

The conversation about infrastructure noise is really a conversation about **what we're measuring**.

A benchmark score is not a property of a model. It's a property of a *system*: model + scaffold + infrastructure + task set + scoring function. When we strip away the infrastructure dimension and pretend the score is purely about the model, we're fooling ourselves — and potentially making bad decisions about which models to ship.

For harness engineers, the takeaway is simple: **treat your infrastructure config with the same rigor you apply to your task definitions and scoring logic.** It's not plumbing. It's part of the experiment.

---

## Further Reading

- **Anthropic Engineering** — "Quantifying infrastructure noise in agentic coding evals" (April 2026). The primary source for the data discussed in this guide.
- **SWE-bench** — [swebench.com](https://www.swebench.com). The most widely used agentic coding benchmark, and the context for much of this discussion.
- **Docker Resource Constraints** — [docs.docker.com/config/containers/resource_constraints](https://docs.docker.com/config/containers/resource_constraints/). Reference for understanding CPU shares, memory limits, and OOM behavior in containerized environments.
- **cgroups v2 Documentation** — [kernel.org/doc/html/latest/admin-guide/cgroup-v2.html](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html). How Linux enforces resource guarantees at the kernel level.

---

*Infrastructure is not the background. In agentic evals, it's the stage — and the stage changes the performance.*
