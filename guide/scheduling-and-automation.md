---
title: "Scheduling & Automation"
section: practice
author: Nexu
---

> **Core Insight:** An Agent that only responds when spoken to is a chatbot; an Agent that acts on schedule, on event, and on its own initiative is a productivity system.

## Why Scheduling?

Most people encounter Agents as conversational interfaces — you type, it replies. That mental model caps the value at "faster search engine." The real unlock happens when Agents execute work *without being asked*.

Consider the difference:

- **Reactive:** "Summarize my unread emails." → Agent responds.
- **Scheduled:** Every morning at 8:00 AM, Agent reads your inbox, filters for urgency, formats a digest, and pushes it to your Slack channel. You wake up to a briefing you never requested.

The second pattern compounds. One scheduled task saves you five minutes a day. Ten scheduled tasks reshape how you work. Scheduling transforms an Agent from a tool you use into a system that works for you.

This chapter covers the primitives that make scheduled Agent work possible inside a Harness — the runtime environment that hosts an Agent's Tools, Context, memory, and execution lifecycle.

---

## Types of Scheduled Agent Work

Not all automation follows the same clock. Four patterns cover the landscape:

### One-Shot Timers

A single delayed execution. The user says "remind me in 20 minutes" or "send that follow-up email at 3 PM." The Harness creates a timer, fires once, and discards it.

Key properties:
- Fires exactly once
- Often created conversationally ("remind me…")
- Short-lived — minutes to hours, rarely days
- No recurrence logic needed

One-shot timers are the simplest scheduling primitive. They require only a timestamp and a payload.

### Recurring Crons

A Cron (named after the Unix `cron` daemon) is a job that runs on a repeating schedule defined by a Cron expression — a compact syntax specifying minute, hour, day, month, and day-of-week.

Examples:
- `0 8 * * *` → every day at 08:00
- `0 9 * * 1` → every Monday at 09:00
- `*/30 * * * *` → every 30 minutes

Crons are the backbone of Agent automation. Daily digests, weekly reports, periodic monitoring — all Cron territory.

### Event-Triggered

Not all schedules are time-based. Some work should fire in response to external events:

- A new Pull Request is opened → spawn a review Agent
- A deployment completes → run smoke tests and report
- A new email arrives from a VIP sender → summarize and alert

Event-triggered automation requires an event source (webhook, polling, or platform integration) and a dispatch mechanism that creates an Agent turn when the event fires. The Harness doesn't run on a clock here — it runs on signals.

### Heartbeat-Based

A Heartbeat is a periodic poll where the Harness injects a prompt into the Agent's *main session* at a regular interval (typically every 15–60 minutes). The Agent reads the prompt, decides what to check, and either acts or stays silent.

Unlike Cron, which creates isolated executions, a Heartbeat runs inside the ongoing conversation. The Agent has access to recent messages, user context, and session state. This makes Heartbeats ideal for batching multiple lightweight checks into a single turn.

A typical Heartbeat prompt:

```
Read HEARTBEAT.md if it exists. Follow it strictly.
If nothing needs attention, reply HEARTBEAT_OK.
```

The Agent might check email, glance at the calendar, review notifications — all in one turn, all with conversational context.

---

## Cron Implementation Patterns

Crons are the most structured scheduling primitive. Getting them right requires attention to four dimensions: schedule definition, session targeting, payload type, and delivery.

### Schedule Definition

**Cron expressions** use the standard five-field format:

```
┌───────── minute (0–59)
│ ┌─────── hour (0–23)
│ │ ┌───── day of month (1–31)
│ │ │ ┌─── month (1–12)
│ │ │ │ ┌─ day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

**Timezone handling** is the single most common source of Cron bugs. The rule is simple:

> **Store UTC. Display local.**

Internally, the Harness evaluates all Cron expressions against UTC. When showing the user their schedule, convert to their local timezone. When the user says "every day at 8 AM," the Harness must know *which* 8 AM — ask for timezone if unknown, store the UTC equivalent, and confirm back in local time.

```
User: "Run my digest every morning at 8am"
Agent: "Got it — daily digest at 8:00 AM Asia/Shanghai (0:00 UTC). ✓"
```

This avoids ambiguity and survives daylight saving transitions (for timezones that observe them).

### Session Targeting

When a Cron fires, *where* does the Agent run? Two models:

**Isolated session** — the Cron spawns an independent Agent turn with a fresh Context window. No conversation history. No prior messages. The Agent starts clean, executes its task, and terminates.

Benefits:
- No history pollution — the main session stays clean
- Predictable context — the Agent sees only what the Cron provides
- Parallelizable — multiple Cron jobs can run concurrently without interference
- Configurable — each job can use a different model or thinking level

Use isolated sessions for standalone tasks: digests, reports, monitoring checks, data collection.

**Main session** — the Cron injects content into the user's current active session. The Agent sees the full conversation history and can reference recent messages.

Benefits:
- Conversational context — the Agent knows what you've been discussing
- Continuity — can follow up on earlier threads
- Lower overhead — no new session to create

Use main session injection sparingly. Every injection adds to the context window, and too many will bloat it (see Anti-patterns below).

### Payload Types

What exactly does the Cron deliver when it fires?

**agentTurn** — triggers a full Agent execution cycle. The Agent receives a prompt, has access to all its Tools and Skills, can make decisions, call APIs, read files, and produce output. This is the most powerful payload type.

Example: a daily digest Cron fires with an `agentTurn` payload. The Agent reads emails via IMAP, checks the calendar, fetches weather, formats everything into a briefing, and pushes it to a channel. Full autonomy.

**systemEvent** — injects a text message into the session without triggering a full Agent turn. Think of it as dropping a note into the conversation. The Agent will see it on its next turn (or Heartbeat) but doesn't immediately act.

Example: a webhook receives a deployment notification and injects "Deploy v2.3.1 completed successfully" as a systemEvent. The Agent doesn't need to act — but the information is available if the user asks about it.

### Delivery

Where do the results go?

- **Announce to channel** — the Agent's output is pushed to a specific messaging channel (Slack, Discord, Feishu group, etc.). This is the most common delivery for digests and alerts.
- **Webhook** — results are POSTed to an HTTP endpoint for integration with external systems.
- **None (silent)** — the Cron runs but produces no external output. Useful for background maintenance tasks like memory cleanup or data pre-fetching.

Delivery configuration should be set at Cron creation time and pinned to the originating session. If a user creates a Cron in a Feishu group, results should deliver to that group — not follow the user to wherever they chatted most recently.

---

## Real-World Examples

### LangSmith Deployments Cron

LangChain's LangSmith platform introduced Cron jobs for their Deployments feature (see [LangSmith Cron Jobs documentation](https://docs.langchain.com/langsmith/cron-jobs)). The model:

1. Create a Deployment (a hosted LangGraph agent)
2. Define a Cron schedule
3. On each tick, the system creates a new thread and sends a fixed input

This approach is clean and predictable. Every execution gets the same input, a fresh thread, and produces traceable output in LangSmith's monitoring UI.

**Strengths:**
- Simple mental model — same input, fresh thread, every time
- Full observability through LangSmith traces
- Integrates with LangGraph's state management

**Limitations:**
- Fixed input per Cron — you can't dynamically adjust what the Agent does based on context
- Thread-per-execution means no continuity between runs
- Tied to LangSmith's Deployment infrastructure

### Harness-Native Cron

The Harness pattern offers a richer model:

1. Define a Cron with schedule, session targeting, payload, and delivery
2. On each tick, the Harness spawns an isolated session (or injects into main)
3. The Agent has full Tool access — it can read files, call APIs, search the web, use any installed Skill
4. Results deliver to the configured channel

```yaml
# Conceptual Cron definition
schedule: "0 8 * * *"          # 8:00 AM UTC
timezone: "Asia/Shanghai"       # Display reference
session: isolated               # Fresh context each run
payload: agentTurn              # Full Agent execution
model: claude-sonnet            # Can differ from default
delivery:
  type: announce
  channel: feishu-group-abc     # Pinned to originating session
prompt: |
  Generate today's morning briefing:
  1. Check unread emails for urgent items
  2. List today's calendar events
  3. Summarize overnight GitHub notifications
  Format as a concise digest.
```

**Key differences from LangSmith:**
- Dynamic prompts — the Agent decides what to do, not just processes fixed input
- Full Skill access — can use any Tool the Harness provides
- Per-job model selection — use a cheaper model for simple checks, a stronger one for analysis
- Flexible delivery — channel, webhook, or silent

### Daily Digest Pattern

The most common Cron use case. The flow:

```
Cron fires (8:00 AM local)
  → Agent spawns in isolated session
  → Reads email (IMAP Tool)
  → Reads calendar (Calendar Tool)
  → Checks weather (Weather Skill)
  → Checks GitHub notifications (GitHub Skill)
  → Formats digest with priorities and highlights
  → Pushes to user's preferred channel
  → Session terminates
```

The value multiplier: this runs every day whether the user remembers to ask or not. Information arrives pre-processed and formatted.

### Monitoring Pattern

A Cron that checks metrics and alerts only when thresholds are crossed:

```
Cron fires (every 15 minutes)
  → Agent checks API response times
  → Compares against threshold (p99 < 500ms)
  → If healthy: silent (no delivery)
  → If degraded: alert to ops channel with details
  → Session terminates
```

The key design choice: **alert on exception, not on every check.** A monitoring Cron that pushes "everything is fine" every 15 minutes is noise. One that stays silent until something breaks is signal.

---

## Heartbeat vs Cron: When to Use Each

Both Heartbeat and Cron enable periodic Agent work. They serve different purposes.

| Dimension | Heartbeat | Cron |
|-----------|-----------|------|
| **Timing** | Approximate (drift is acceptable) | Exact (fires on schedule) |
| **Context** | Main session (full history) | Isolated (fresh context) |
| **Checks per run** | Multiple (batched) | Single task focus |
| **Session impact** | Adds to main context window | No main session impact |
| **Configuration** | Edit HEARTBEAT.md | Explicit Cron definition |
| **Model** | Uses session's model | Can specify per-job |

**Use Heartbeat when:**
- You want to batch 3–5 lightweight checks (email + calendar + notifications) into one turn
- The Agent needs conversation context to decide what matters
- Timing precision doesn't matter (every ~30 minutes is fine)
- You want to reduce total API calls by combining periodic checks

**Use Cron when:**
- Exact timing matters ("9:00 AM sharp every Monday")
- The task should run in isolation without polluting the main session
- You want a different model or thinking budget for the task
- The output should deliver to a specific channel without touching the main session
- One-shot reminders ("remind me in 20 minutes")

**Rule of thumb:** if you have five things to check periodically and none require exact timing, put them in HEARTBEAT.md instead of creating five Cron jobs. If you have one task that must run at exactly 9 AM with a specific model and deliver to a specific channel, that's a Cron.

---

## Anti-Patterns

### Polling Loops

```python
# ❌ Don't do this
while True:
    result = check_something()
    if result.changed:
        notify()
    sleep(60)
```

This burns a persistent process, wastes compute, and bypasses the Harness's scheduling infrastructure. Use a Cron with a 1-minute interval instead. The Harness manages lifecycle, retries, and resource cleanup.

### Main Session Pollution

Injecting too many systemEvents into the main session bloats the Context window. Every injection adds tokens. After a day of frequent injections, the Agent's context is dominated by system noise rather than useful conversation.

**Symptom:** Agent responses slow down, become less coherent, or lose track of conversation topics.

**Fix:** Use isolated sessions for high-frequency work. Reserve main session injection for rare, high-signal events that the user needs to see in context.

### No Timeout

A Cron job that can run indefinitely is a resource leak. If the Agent gets stuck (waiting for an API, caught in a reasoning loop), the job hangs forever.

**Fix:** Every Cron job should have a timeout. A reasonable default is 2–5 minutes for simple tasks, 10–15 minutes for complex ones. If a job can't complete in its timeout window, it should fail loudly — not hang silently.

### Duplicate Delivery

```yaml
# ❌ Cron announces to channel AND agent manually sends message
delivery:
  type: announce
  channel: slack-general
prompt: |
  Check metrics and send results to #general  # Agent also sends!
```

If the Cron is configured to announce results to a channel, and the Agent's prompt also instructs it to send a message to the same channel, the user gets the same content twice.

**Fix:** Choose one delivery mechanism. Either let the Harness announce, or let the Agent send manually — never both.

---

## Design Checklist

Before creating any scheduled Agent work:

1. **Timezone** — do you know the user's timezone? If not, ask.
2. **Session type** — does this need conversation context (main) or clean execution (isolated)?
3. **Delivery** — where should results go? Pin to the originating session.
4. **Timeout** — what's the maximum acceptable runtime?
5. **Failure mode** — what happens if the job fails? Silent? Alert? Retry?
6. **Frequency** — is this better as a Cron or a HEARTBEAT.md entry?
7. **Deduplication** — are you sure results won't double-deliver?

Get these seven right, and your scheduled Agent work will be reliable, predictable, and genuinely useful.

---

## Summary

Scheduling is what separates a conversational novelty from a productivity system. The Harness provides four primitives — one-shot timers, recurring Crons, event triggers, and Heartbeats — each suited to different automation shapes.

The architecture choices matter: store UTC, display local. Isolate sessions by default. Set timeouts. Pin delivery to the originating channel. Batch lightweight checks into Heartbeats instead of spawning many Crons.

An Agent that acts on its own initiative, on schedule, without being asked — that's not a chatbot anymore. That's infrastructure.
