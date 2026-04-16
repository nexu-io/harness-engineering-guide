# Every AI Startup Should Watch Out: 1000+ Ghost Accounts Drained Our Platform in 15 Days

> **Nexu** is an open-source, one-click-install OpenClaw desktop client that puts AI in your hands — locally.
> GitHub: **[https://github.com/nexu-io/nexu](https://github.com/nexu-io/nexu)**
> ⭐ If you find it useful, a Star means the world to us.

We're building **Nexu** 🦞, an open-source OpenClaw desktop client on GitHub. When new users sign up, they get free credits to try various LLMs on the platform.

One day, while cleaning up user data, we noticed something odd — **an email domain we'd never seen before had an abnormally high number of registered users**. Higher than many corporate domains. Sitting near the top of our domain leaderboard.

This article is a complete record of how we went from **"that's weird" → multi-dimensional drill-down → baseline comparison → conclusion**. We also open-sourced the entire investigation methodology as an installable Skill — you'll find it at the end.

## 01 / A Domain That Shouldn't Be on the Leaderboard

When we sorted registered users by email domain, the usual suspects were at the top — gmail.com, qq.com, various corporate domains.

But one domain sat suspiciously high (anonymized as **xx.love** below). It had over **1,000 registered users**.

A domain we'd never heard of, with more signups than many enterprise domains. That alone was a signal worth digging into.

A quick background check:

- Registered in early 2026, WHOIS privacy protection — no registrant info
- DNS hosted on Cloudflare with MX records — **capable of sending and receiving email**
- No A records, no website, no ICP filing

A domain built solely for email, with zero public web presence. Keep this in mind.

## 02 / Two Distinctly Different Phases

Plotting these 1,000+ accounts on a timeline revealed they weren't evenly distributed — they **clearly split into two phases**.

**Phase 1 (Day 1–7): Low-volume probing**

Single digits to a few dozen per day, ~150 total. Email prefixes were varied — some looked like real names (linlong, wuyan), some were obvious test inputs (ooo, qwe), plus some mixed strings. Inconsistent, like someone experimenting.

**Phase 2 (Day 8 onward): High-volume flood**

700+ in a single day. Prefixes shifted almost entirely to **6-character alphanumeric random strings** (e.g., 01mh07, x9k2p3). Within 10-minute windows, we repeatedly saw bursts of 16–18 accounts, with a median registration interval of about **37 seconds**.

This wasn't just scaling up — the **naming strategy changed entirely**. From "someone typing at a keyboard" to "a script doing the work."

## 03 / User-Agent Fingerprints Shifted in Sync

Registration behavior alone might not be conclusive, but User-Agent changes added another layer of confirmation.

- Phase 1: Almost exclusively **Chrome N (Windows)**
- Phase 2: Primary UA shifted to **Chrome N+1 (Windows)**

Moreover, email prefix patterns correlated with specific UAs:

- "Name-like," "5-char," and "7-char" prefixes → almost all Chrome N
- "6-char random" prefixes → overwhelmingly Chrome N+1

The prefix switch and UA switch happened simultaneously. It looked like the entire registration environment was upgraded at once.

## 04 / The Baseline Comparison Exposed Everything

**Side by side with the general user population, the differences were stark.**

| Metric | Suspicious Domain | All Users |
|--------|-------------------|-----------|
| Session structure | Almost all single-session | Commonly multi-session |
| Multi-IP / multi-UA switching | Almost none | Clearly present |
| UA diversity | ~1,000+ sessions / 3 UAs | ~4,000 sessions / 190 UAs |
| Registration → first use | **~5 hours** | ~8 minutes |
| Accounts with usage | 73.8% | 81.4% |

**Highly converged environment.** Normal users switch devices and browsers all the time — 4,000 sessions mapped to 190 distinct UAs. The suspicious domain? 1,000+ sessions across just 3 UAs. Two orders of magnitude more concentrated.

**Register first, activate later.** Normal users start using the product within a median of 8 minutes after signup. These accounts waited a median of 5 hours. Not inactive — more like "build the pool first, activate on schedule."

**Selective activation.** 73.8% of accounts eventually made API calls. These weren't throwaway registrations — this was a selectively activated account pool.

## 05 / Not Just Vanity Metrics — Real Resource Drain

If these accounts had just sat idle, the damage would've been minimal. But they didn't — **they were making API calls at scale**. They consumed **billions of tokens** across most major models on the platform. The inference cost was significant.

The calls weren't concentrated on one or two models, but spread broadly — thousands to tens of thousands of calls per model.

This wasn't "sign up, grab credits, leave." It was **systematic consumption of platform API resources**.

## 06 / Technical Retro: Four Takeaways

**🔍 Always establish baselines**

Many metrics are meaningless in isolation. "Created a session shortly after signup" sounds normal — but 80% of all users do that. Only by comparing against the baseline can you distinguish "normal" from "anomalous."

**📊 Cross-dimensional analysis > single-metric judgment**

Prefixes alone, UA alone, registration timing alone — each could be dismissed as coincidence. But when all three dimensions shift in sync, the probability of coincidence approaches zero.

**⏱ Zoom into the timeline**

Aggregated data masks phase transitions. Break it down by day or even by hour to spot the "probing → flooding" inflection point.

**🎯 Restraint is more convincing than accusations**

Throughout this analysis, we never said "this is a malicious attack." We only described the patterns the data revealed. Restrained conclusions are actually more persuasive — because the facts speak for themselves.

## 07 / Conclusion

The 1,000+ accounts under this suspicious domain form a **highly homogeneous, batch-processed, systematized** account cluster.

- ✅ Clear "probing → flooding" two-phase transition
- ✅ Prefix patterns, UA fingerprints, and registration cadence all shifted in sync
- ✅ Compared to the general population: environment convergence, activation timing, and session structure all significantly deviated
- ✅ More consistent with "build an account pool, then selectively activate" than simple spam registration

For early-stage SaaS products, this kind of batch registration may not be immediately fatal. But the impact is real — **stolen API costs, polluted growth metrics, and the risk of escalation if left unchecked.** The sooner you build anomaly detection capabilities, the sooner you stop the bleeding.

## 08 / We Open-Sourced Our Investigation as a Skill

We packaged the entire investigation workflow into an open-source Skill called **abuse-hunter**.

Install it in Nexu:

```
/skill install https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter
```

Then kick off an investigation with one sentence:

```
Check for email domains with abnormally high registration volumes and look for signs of batch account farming
```

It automatically runs a **6-step investigation** and outputs a scored report:

- **Email domain clustering** — identify domains with abnormal signup volume
- **Registration cadence analysis** — organic growth vs. batch injection
- **Prefix pattern recognition** — human-created vs. script-generated
- **UA fingerprint comparison** — environment diversity vs. convergence
- **Activation timing analysis** — instant use vs. delayed activation
- **Credit consumption stats** — quantify actual financial impact

Final output: a 12-point composite score with recommended actions. It also ships with a Python script for offline CSV analysis.

🔗 abuse-hunter Skill: **[https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter](https://github.com/nexu-io/harness-engineering-guide/tree/main/skills/abuse-hunter)**

📘 Harness Engineering Guide — hands-on tutorials for harness engineering: **[https://github.com/nexu-io/harness-engineering-guide](https://github.com/nexu-io/harness-engineering-guide)**

## 09 / About Nexu

Nexu is a one-click installable OpenClaw desktop client that lets you control everything with AI, locally.

Whether you use WeChat, Feishu, DingTalk, WeCom, QQ, Slack, Discord, WhatsApp, or Telegram — your Agent lives right in your chat window, helping you write code, fix bugs, run automations, manage schedules, and do research.

🦞 **Nexu**: **[https://github.com/nexu-io/nexu](https://github.com/nexu-io/nexu)**

If you're interested in real-world AI Agent practices — whether it's architecture, product design, or growth security — give us a Star ⭐, or open an Issue / Discussion to chat.