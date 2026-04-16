---
author: Nexu
---

# Long-Running Agent Harness Design

> **Core Insight:** Short-task agents fail gracefully — they either finish or time out. Long-running agents fail insidiously. They produce bloated context, degrade silently, and convince themselves they're doing great work while drifting off course. Designing a harness for long-running agents means designing against these failure modes.

## Why Long-Running Agents Are Hard

A "short-task" agent — answer a question, write a function, summarize a document — lives and dies within a single context window. It finishes or fails visibly.

A "long-running" agent operates over hours or days: refactoring a codebase, writing a 50-page report, running a multi-stage pipeline. These agents face problems short-task agents never encounter:

1. **Context accumulates.** Every tool call, every intermediate result, every reasoning step adds tokens. A 200K window fills faster than you think.
2. **Quality degrades silently.** The agent doesn't crash — it just gets worse. Responses get vaguer, instructions get forgotten, earlier context gets pushed out.
3. **Self-assessment lies.** Ask an agent "is your work good?" and it will say yes. Always. This is fine for a 30-second task you can eyeball. It's catastrophic for a 4-hour pipeline you're not watching.

## Failure Mode #1: Context Anxiety

As a long-running agent fills its context window, something counterintuitive happens: the model starts rushing. It wraps up prematurely, cuts corners, and declares "done" before the work is actually complete.

This is **context anxiety** — the model's implicit awareness that it's running out of room. It manifests as:

- Skipping steps it would normally perform
- Producing shorter, less thorough outputs
- Declaring completion early with "I've covered the main points"
- Avoiding tool calls that would add more context

Context anxiety is emergent across architectures. The model has learned that conversations end, and as space shrinks, it gravitates toward ending.

**A bigger window delays the problem; it doesn't solve it.** The fix is architectural: manage context lifecycle explicitly.

## Failure Mode #2: Self-Evaluation Bias

Ask a generator to evaluate its own output. It will rate itself 8/10 or higher — consistently, regardless of actual quality. This is **self-evaluation bias**, and it's the second silent killer of long-running agents.

Why? The model has full context of its own reasoning — every choice feels justified. Admitting failure means contradicting prior outputs, which LLMs resist. And training data rewards confidence over self-doubt.

In a short task, a human catches problems. In a long-running task, the agent runs autonomously. If it evaluates its own outputs and always says "looks good," errors compound unchecked.

```
Short task:   Agent produces → Human reviews → Feedback
Long-running: Agent produces → Agent reviews → "Looks great!" → Errors compound
```

The insight from adversarial network design applies here: **never let the generator grade its own exam.**

## Context Management: Reset vs. Compaction

When context fills up, you have two options. Each has real trade-offs.

### Context Reset

Wipe the conversation and start fresh. Pass a summary of prior work into the new context as a "briefing."

```
Turn 1-50:  [full conversation history]
            ↓ context 80% full
Turn 51:    [system prompt + summary of turns 1-50 + current task]
            ↓ fresh start, ~10% context used
Turn 51-100: [continues from summary]
```

**Pros:** Clean slate, predictable token budget, eliminates context anxiety for the new segment.

**Cons:** Lossy — summaries miss nuance and failed approaches. "Summary of a summary" degrades across multiple resets. Agent may revisit dead ends.

### Context Compaction

Selectively compress older turns while keeping recent ones intact. Collapse multi-turn reasoning into summaries, drop verbose tool outputs.

```
Turn 1-20:  [compressed: 3-line summary of early exploration]
Turn 21-40: [compressed: key decisions and outcomes]
Turn 41-50: [full detail: recent work in progress]
```

**Pros:** Preserves continuity. Graduated — recent turns stay detailed, older turns compressed. Agent retains awareness of what it tried.

**Cons:** Compression quality varies. More complex to implement. Compacted context can confuse the model if summaries conflict with recent state.

### Which to Choose?

| Scenario | Prefer |
|----------|--------|
| Tasks with clear phases (research → write → review) | Reset between phases |
| Continuous iteration on a single artifact | Compaction |
| Agent frequently revisiting earlier decisions | Compaction (preserves decision history) |
| Context has accumulated many tool outputs | Reset (tool outputs compress poorly) |

In practice, many harnesses use a hybrid: compaction within a phase, reset between phases.

## Generator-Evaluator Architecture

Borrow from GANs: the generator creates, the discriminator judges — separate networks with opposing objectives. Apply the same principle to agents:

```
┌─────────────┐         ┌──────────────┐
│  Generator  │────────►│  Evaluator   │
│  (Agent A)  │         │  (Agent B)   │
│             │◄────────│              │
│  Produces   │ feedback│  Judges      │
│  output     │         │  output      │
└─────────────┘         └──────────────┘
        │                       │
        │    Separate context   │
        │    Separate prompt    │
        │    Separate criteria  │
```

**Key design rules:**

1. **Separate contexts.** The evaluator sees only the output, not the generator's reasoning. Prevents sympathy bias.
2. **Explicit rubric.** Grade against a checklist, not vibes. "Does the code handle edge case X?" beats "Is the code good?"
3. **Actionable feedback.** Return specific issues, not scores. "Function `parse_input` doesn't handle empty strings" is useful. "7/10" is not.
4. **Iteration budget.** Cap the loop. Without a limit, perfectionist evaluator + eager generator = infinite cycle.

```python
def generator_evaluator_loop(task, max_iterations=3):
    output = None
    for i in range(max_iterations):
        # Generator: produce or revise
        if output is None:
            output = generator.run(task)
        else:
            output = generator.revise(task, output, feedback)

        # Evaluator: judge with fresh eyes
        evaluation = evaluator.judge(task, output)  # no generator context!

        if evaluation.passes:
            return output

        feedback = evaluation.issues

    return output  # best effort after max iterations
```

## Three-Agent Architecture: Planner → Generator → Evaluator

For complex long-running tasks, add a **Planner** for decomposition, execution, and quality control.

```
                    ┌─────────────┐
                    │   Planner   │
                    │             │
                    │ Decomposes  │
                    │ task into   │
                    │ subtasks    │
                    └──────┬──────┘
                           │
                           ▼
              ┌─── subtask list ───┐
              │                    │
              ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  Generator  │      │  Generator  │   (parallel or sequential)
     │  subtask 1  │      │  subtask 2  │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            ▼                    ▼
     ┌─────────────┐      ┌─────────────┐
     │  Evaluator  │      │  Evaluator  │
     │  subtask 1  │      │  subtask 2  │
     └──────┬──────┘      └──────┬──────┘
            │                    │
            └────────┬───────────┘
                     ▼
              ┌─────────────┐
              │   Planner   │
              │  (reviews   │
              │   results,  │
              │   re-plans  │
              │   if needed)│
              └─────────────┘
```

**Planner** — Decomposes the goal into subtasks with success criteria. Re-plans when evaluators flag issues. Holds the vision but doesn't execute.

**Generator** — Executes one subtask at a time with a fresh context. Has tools, files, execution environments. Doesn't evaluate its own work.

**Evaluator** — Sees only the generator's output (not reasoning). Grades against the planner's criteria. Returns pass/fail plus specific issues.

The critical property: **each agent operates in its own context window.** The generator can fill its 200K window with code exploration and still produce a clean output. The evaluator starts fresh. The planner maintains a high-level view without implementation details.

```python
def three_agent_pipeline(goal, max_replans=2):
    plan = planner.decompose(goal)

    for replan in range(max_replans + 1):
        results = {}
        for subtask in plan.subtasks:
            # Generator: fresh context per subtask
            output = generator.execute(subtask)

            # Evaluator: fresh context, only sees output + criteria
            evaluation = evaluator.judge(
                subtask=subtask,
                output=output,
                criteria=subtask.success_criteria
            )

            results[subtask.id] = {
                "output": output,
                "evaluation": evaluation
            }

        # Check if all subtasks pass
        failures = [r for r in results.values() if not r["evaluation"].passes]
        if not failures:
            return assemble_results(results)

        # Re-plan: planner sees which subtasks failed and why
        plan = planner.replan(goal, results)

    return assemble_results(results)  # best effort
```

## Anti-Patterns

### Anti-Pattern #1: The Monolith Agent

Stuffing planning, execution, evaluation, and context management into a single agent.

```python
# DON'T DO THIS
response = llm.chat(
    system="""You are a planner, coder, reviewer, and project manager.
    First plan the work, then do the work, then review your own work.
    If the review finds issues, fix them and review again.""",
    messages=conversation  # 150K tokens of accumulated history
)
```

This fails for every reason above: context fills up, self-evaluation is unreliable, no separation of concerns. Works for simple tasks, collapses on complex ones.

### Anti-Pattern #2: Evaluation Without a Rubric

```python
# DON'T DO THIS
evaluation = evaluator.judge(
    prompt=f"Is this output good? Rate 1-10.\n\n{output}"
)
# Result: always 8/10. Always.
```

An evaluator without criteria is just a generator with imposter syndrome. Always provide a rubric:

```python
# DO THIS
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

### Anti-Pattern #3: Infinite Re-Planning

```python
# DON'T DO THIS
while not all_subtasks_pass:
    plan = planner.replan(goal, results)  # loops forever
    results = execute_plan(plan)
```

Always cap iteration. Three failed re-plans means a spec problem, not an execution problem. Surface it to a human.

## Putting It Together: A Minimal Implementation

```python
class LongRunningHarness:
    """Planner → Generator → Evaluator harness for long-running tasks."""

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

        return self._assemble(results, partial=True)  # best effort

    def _generate_with_eval(self, subtask, max_iterations):
        output = None
        for i in range(max_iterations):
            output = self.generator.execute(
                subtask=subtask,
                prior_feedback=output.get("feedback") if output else None
            )

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

## Key Takeaways

1. **Long-running ≠ short-running with more time.** The failure modes are qualitatively different.
2. **Context anxiety is real.** Manage context lifecycle with resets, compaction, or both.
3. **Never let the generator grade its own exam.** Separate agents, separate contexts, explicit rubrics.
4. **Cap everything.** Max turns, max re-plans, max iterations. Unbounded loops burn tokens.
5. **Decompose first.** Context-sized chunks prevent most context problems before they start.

## Further Reading

- [Context Engineering](context-engineering.md) — deep dive on context assembly, compression, and budgeting
- [Multi-Agent Orchestration](multi-agent-orchestration.md) — orchestration patterns beyond the three-agent architecture
- [Error Handling](error-handling.md) — handling failures, retries, and graceful degradation in agent loops
- [Anthropic: Building effective agents](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/building-effective-agents) — Anthropic's guide on agent design patterns
