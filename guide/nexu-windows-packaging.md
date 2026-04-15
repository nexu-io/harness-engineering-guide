---
author: Nexu
title: "The Billion-Token Battle: Shipping Our OpenClaw Windows Client"
description: "Build time 15min→4min, install time 10min→2min, fully automated CI, macOS/Windows updates decoupled — how we rebuilt our Electron packaging pipeline"
category: Engineering
date: "2026-04-15"
originalUrl: https://gist.github.com/joeylee12629-star/cb9ae3801d562f75a1e3659ffcf1abc6
---

# The Billion-Token Battle: Shipping Our OpenClaw Windows Client

> **Nexu** is an open-source, one-click-install OpenClaw desktop client that puts AI in your hands — locally.
> GitHub: **https://github.com/nexu-io/nexu**
> ⭐ If you find it useful, a Star means the world to us.

Last week we shipped Nexu v0.1.12 with full Windows support. As the world's first open-source OpenClaw desktop client — processing **billions of tokens daily** — Windows was by far the most requested feature from our community.

But "Windows support" is three words that hide a complete rebuild of our packaging pipeline. Here's what changed:

| Metric | Before | After |
|--------|--------|-------|
| ⏱ **Build time** | 15 min | **4 min** |
| 📦 **Install time** | 10 min | **under 2 min** |
| 🔄 **CI builds** | manual | **fully automated** |
| 🧩 **Update logic** | coupled | **macOS/Windows decoupled** |

We hit plenty of walls along the way and made some unconventional technical decisions. Since we're open source, **there's no reason to keep these lessons to ourselves**. This is the first post in a series — hopefully it saves you some pain if you're shipping Electron apps cross-platform.

## Where electron-builder Falls Short

![Where electron-builder Falls Short](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-01.jpg)

electron-builder is the de facto standard for packaging Electron apps. Most projects use it end-to-end, from source to final installer. So did we, initially.

But once we actually ran the full Windows pipeline in production, the default path started breaking down:

- Nexu's packaged file tree contains roughly **38,000 files**. Default ZIP compression handles this scale terribly — both in build time and install time
- We needed **custom installer logic** — data migration options, registry cleanup, user-facing choices that electron-builder's defaults don't support
- macOS and Windows have **fundamentally different update semantics**. Forcing them into the same code path was creating fragile, hard-to-debug behavior
- CI artifacts need to be **reproducible** regardless of local machine setup

electron-builder still handles producing `win-unpacked` (the raw app directory). But from that point on, we took over.

## Custom 7z + NSIS Pipeline

![Custom 7z + NSIS Pipeline](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-02.jpg)

Our new pipeline has two stages:

**Stage 1: electron-builder produces win-unpacked**
Standard Electron app directory — exe, dlls, resources. electron-builder still does this well.

**Stage 2: Custom packaging takes over**

- Vendored **7-Zip** compresses win-unpacked into `payload.7z`
- **makensis** compiles a custom NSIS installer
- The installer handles extraction, registry writes, shortcuts, and uninstall cleanup

**Why 7z?** With 38,000 files, 7z's solid compression treats the entire tree as a single block — dramatically better compression ratio and extraction speed than ZIP. This is the single biggest reason install time dropped from 10 minutes to under 2.

**Why NSIS?** Full control over every aspect of the install flow — paths, migration options, registry, uninstall. No more fighting framework defaults.

We also vendored 7-Zip directly into the repo, so both CI and local builds have zero external dependencies. Reproducibility out of the box.

## Platform Update Drivers

![Platform Update Drivers](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-03.jpg)

This one bit us hard. Our update logic for macOS and Windows used to share a single code path, branched with `if (platform === 'win32')`.

The problem is that these platforms have fundamentally different update models:

- macOS can **silently update in-app**
- Windows requires **quit → run installer → restart**

Cramming both into one path meant every Windows fix risked breaking macOS. So we introduced an **Update Driver** abstraction — three independent platform drivers:

- **mac-update-driver** — in-app download and install
- **windows-update-driver** — external download + installer redirect
- **unsupported-update-driver** — graceful fallback for other platforms

Each platform now evolves independently. If you're building cross-platform Electron apps, **introduce this separation early** — you'll thank yourself later.

## Runtime Path Resolution

![Runtime Path Resolution](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-04.jpg)

Here's a subtle one: after packaging, runtime file locations depend on your build config. Our old code used loose heuristics to find them — which mostly worked, until it didn't.

Any change in build output layout could silently break runtime discovery. And these failures only showed up in packaged builds — never in local dev.

We wrote a dedicated Windows runtime locator that resolves paths **explicitly relative to the exe**. The contract between build output layout, runtime packaging, and runtime discovery is now tight.

Before: "it's probably around here." Now: **"it must be exactly here, or fail loudly."** No more silent breakage in production.

## CI/CD Pipeline

![CI/CD Pipeline](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-05.jpg)

Previously, Windows builds were a local-only affair — success depended on your machine's toolchain being set up correctly.

We moved the entire build → package → sign → publish flow to GitHub Actions:

- **Nightly / beta / release** — all three workflows now fully support Windows
- Auto-generates `latest-win.json` update manifests
- Artifacts include installer, hashes, and metadata — fully traceable

For open-source projects, reproducible CI is everything. Any contributor can build and get the exact same output.

## What's Next

![What's Next](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-en-06.jpg)

The real value of this work isn't a flashy new feature — it's **infrastructure that compounds**. More control over packaging, more stable updates, more predictable paths.

We still have experimental optimizations in the pipeline (like lifecycle-driven Windows data migration), which we'll cover in the next post once they're battle-tested.

The whole point of open source is **sharing what you learn, not just what you ship**.

## Further Reading

- [Nexu on GitHub](https://github.com/nexu-io/nexu) — The open-source OpenClaw desktop client
- [Harness Engineering Guide](https://harness-guide.com) — Free, open-source AI Agent engineering knowledge base
