---
title: "Initializer + Coding Agent — A Two-Phase Harness Pattern"
author: Nexu
date: "2026-04-19"
description: "Why a single agent loop with compaction can't build a multi-day project, and how splitting the harness into an Initializer phase and a repeating Coding phase fixes it."
tags: [harness, long-running-agents, context-engineering, patterns]
---

# Initializer + Coding Agent — A Two-Phase Harness Pattern

If you've ever handed a frontier coding model a prompt like *"build me a Claude.ai clone"* and walked away for the afternoon, you know how this ends: a repo with a working login form, half a message list, a `TODO: hook up streaming` mid-file, and a very confident commit message. The model ran out of context.

The instinct is to blame the model. It's almost always the harness.

This post is about a specific pattern that fixes this class of failure: **split your long-running agent into two phases — an Initializer that runs once, and a Coding Agent that runs many times, each session doing exactly one feature on a clean slate.**

It's based on [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), with a reference in the [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding). I want to unpack *why* it works, not just what it looks like.

---

## Core insight: compaction is not enough

The standard answer to "context windows are finite" is compaction. Summarize the old stuff, keep the new stuff, loop forever.

Compaction is fine for a two-hour refactor. It falls apart for a two-day build.

Point Opus 4.5 on the Agent SDK at a high-level prompt like "build a Claude.ai clone" and watch:

- Session 1 writes a lot of code and hits the context limit with half-finished features.
- Session 2 reads a compacted summary — a lossy, narrative version of what happened — and has to reconstruct intent from it.
- Session 3 reads a compaction of the compaction. Information decays geometrically.

By session 4, the model is playing telephone with its past self. It doesn't know which features are done, which are half-done, and which it hallucinated into the summary.

**Compaction is in-context memory. Long-running agents need out-of-context memory** — files, structured state, git history. Things the agent re-reads every session, not things it carries forward through summarization.

That's the thesis. Everything else is mechanics.

---

## Two failure modes you will hit

Before we get to the pattern, let's be specific about what goes wrong without it. Two failure modes dominate.

### (A) One-shot tendency

The model tries to do everything in one session. Given a big prompt, it writes a big solution. The context fills up. It keeps pushing. The session ends with half-implemented features, `// TODO` scattered mid-function, a test suite that doesn't run, and no clean commit to return to. The model has no idea it's broken — it ran out of room before it could check.

### (B) Premature victory

Sneakier. Session 2 reads the progress notes from Session 1: "implemented login, messaging, streaming." The model looks at the code, sees something that *looks* like login + messaging + streaming, and declares the project done. It didn't run it. It didn't test the flow. It trusted the narrative.

Premature victory is the dual of one-shot. One-shot fails because the model tries to do too much; premature victory fails because the next model trusts the previous one's optimism. Any harness for long-running work has to solve **both** at once. This is why naive "just loop with compaction" doesn't cut it — compaction reinforces the previous session's narrative, which is exactly wrong when that narrative is over-optimistic.

---

## The two-phase harness

The fix is structural. One agent doesn't do everything. You have two roles, with different responsibilities and different lifetimes.

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

The initializer runs **once**. Its job is to turn a fuzzy human brief into a concrete, machine-readable plan plus a runnable scaffold.

The coding agent runs **many times**, each invocation a fresh process with no memory of the last one. It gets its memory by reading the files previous sessions wrote to disk.

Two agents, two purposes, one shared filesystem.

---

## The Initializer Agent

The initializer is the only phase that thinks about the whole project at once. After it finishes, nobody has a global view again — every coding session works locally.

Four artifacts, exactly:

1. **`init.sh`** — one script that sets up the project from a cold checkout: install deps, run migrations, start the dev server in the background, print the URL. Every coding session runs this first. If `init.sh` is broken, nothing else matters.
2. **`feature_list.json`** — the decomposed backlog. Format details in the next section.
3. **`claude-progress.txt`** — short prose notes about where the project is and what's next. Updated at the end of every session.
4. **An initial git commit** — scaffold, scripts, feature list, progress file all at `HEAD`. From here, every session ends with a commit. `git log` is the source of truth for what actually shipped.

The initializer doesn't implement features. It doesn't pick colors. It sets the table.

---

## Feature list design: why JSON beats Markdown

"That's just a todo list, why not a Markdown checklist?"

Because when you give Claude a Markdown file, it treats it as prose. Prose is editable. The model will — with the best intentions — rewrite your priorities, reword descriptions, merge two features because it "felt cleaner," and split one into five because it "clarifies intent." Markdown todo lists are quicksand for agents.

JSON is different. Models are trained to treat JSON as structured data — something you read and write specific fields from, not something you casually rewrite. Combined with an explicit rule that only one field is writable, JSON becomes near-bulletproof external state.

A reasonable schema:

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

The discipline is encoded in the coding agent's system prompt:

> You may only modify the `passes` field. It is unacceptable to remove or edit tests, acceptance criteria, descriptions, or the structure of this file. If you believe a feature is wrong, stop and report — do not silently rewrite it.

That language isn't hedging — it's load-bearing. "Unacceptable" reads to the model as a hard rule. In practice it's enough to keep the file stable across dozens of sessions.

`passes: false` is the other critical detail. It's the agent's only lever. When a session implements a feature, passes e2e tests, and commits clean, it flips the boolean to `true`. One field — not prose, not vibes — is how future sessions know what's actually done.

---

## The coding agent: a startup ritual, not a free-for-all

Every time the coding agent wakes up, it runs the same five-step ritual before touching any code. Not optional.

```
1. pwd                         → confirm we're in the project
2. git log --oneline -20       → what shipped, most recent first
   cat claude-progress.txt     → narrative notes from last session
3. cat feature_list.json       → what's done, what's next, what's blocked
4. bash init.sh                → install, migrate, start dev server
5. hit the app in a browser    → verify last session's work still works
```

Only after step 5 does the agent pick a feature and start writing code.

Call this **context bootstrap** — the out-of-context equivalent of compaction. Instead of inheriting a summary, the agent reconstructs its working context from files on disk. Same canonical sources, same order, every session.

A few things worth pinning down:

- **Git log before progress notes.** Git is ground truth; progress notes are optimistic. If they disagree, git wins.
- **`init.sh` is non-negotiable.** If the dev server won't start, nothing the previous session claimed matters.
- **E2E verification before picking a new feature.** This is what kills premature victory. You don't trust the previous session's "done" — you open the browser.

At step 3 the agent picks *the single highest-priority feature with `passes: false` and all dependencies satisfied*. Not two. Not "a cluster." One. Then it stops when that one is green and committed.

One-feature-per-session kills both failure modes at once: it kills one-shot because the contract artificially constrains scope, and it kills premature victory because "done" isn't self-declared — it's an e2e test passing on a clearly scoped unit.

---

## End-to-end testing is the trust layer

Unit tests are necessary but insufficient. The coding agent wrote them — it can't be the only thing checking them. If the model misunderstood the spec, the unit tests will be wrong in the same shape as the implementation, and they'll pass in a way that means nothing.

End-to-end is where you get independent signal. Spin up the real app, drive it like a user, see what happens.

In practice that means browser automation. [Puppeteer MCP](https://github.com/modelcontextprotocol/servers) works well — the agent can navigate, fill forms, click, and assert on the DOM.

A verification pass for `auth-01`:

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

Three things: (1) it runs against the real server `init.sh` started, not a mock; (2) it checks observable behavior — URLs, DOM, cookies — not internal functions; (3) it's cheap enough to run every session, so the bootstrap's "did last session's work survive?" check is also an e2e pass over already-green features.

This is what makes `passes: true` mean something.

---

## Clean state commits: git + progress file together

At the end of every coding session, two things happen in sequence:

1. `git commit -m "feat(auth-01): email+password signup"` — the code lands.
2. `claude-progress.txt` gets a short append — what shipped, what's tricky, what the next session should look at first.

These do different jobs. Git is the **truth** layer: append-only, timestamped, the diff is not negotiable. `claude-progress.txt` is the **hints** layer: notes to the next agent like "email templates live in `/lib/email/`, I monkeypatched the SMTP client for tests, watch out for the race in `/api/signin` I worked around with a retry."

Both are read at the start of every session. Neither is sufficient alone. Git without hints is terse and hard to reconstruct intent from. Hints without git drift. Together they are the out-of-context memory that replaces compaction.

Both should end the session in a *clean* state — no uncommitted changes, no half-finished files, no broken dev server. If the feature isn't done by the context limit, **the session reverts to the last clean commit and reports "not done"** rather than committing broken work. This is how you keep git trustworthy.

---

## Where this pattern fits (and where it doesn't)

Be honest about the shape of your project before reaching for this.

**Good fits:** web apps (feature-decomposable, e2e testable), CLIs (each subcommand is a natural unit), internal tools / dashboards / admin panels, data pipelines with discrete stages.

**Bad fits:** single-algorithm research like "design a better attention mechanism" (not decomposable into `passes: true/false`), highly coupled codebases where touching one function forces changes across the whole thing, anything whose value lives in *relationships* between components — a compiler's correctness is in global invariants, not "add lexer" + "add parser."

Rule of thumb: if you can write acceptance as "a user (or shell) does X and observes Y," this pattern works. Otherwise pick a different harness.

---

## Implementation sketch

The harness driver itself is small. Most of the work is in the two system prompts.

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

Two things to internalize: **each `run_agent` call is a brand new process** — no shared memory, no shared context window, memory is the filesystem. And **the driver is dumb on purpose** — it doesn't pick features, validate work, or interpret results. All the intelligence is in the prompts and the artifacts.

---

## Closing thought

This pattern works not because the initializer or the coding agent is clever. It works because **"what do I know?" is answered by files on disk, not by the contents of the context window.**

Every time you move state from in-context to out-of-context, you gain durability and lose nothing important. The two-phase harness is an opinionated way of making that move, applied to the specific problem of building software over many sessions.

If your long-running agent keeps "forgetting," the fix is almost never a bigger context window. It's more files.

---

## Further reading

- [scheduling-and-automation.md](./scheduling-and-automation.md) — how to wake the coding agent on a schedule without human babysitting
- [long-running-harness.md](./long-running-harness.md) — the broader family of patterns this fits into
- [memory-and-context.md](./memory-and-context.md) — deeper dive on out-of-context memory, file layouts, and bootstrap rituals
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering, the source material
- [autonomous-coding quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding) — working reference implementation of the two-phase pattern
