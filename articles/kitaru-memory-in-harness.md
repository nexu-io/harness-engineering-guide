# Kitaru 0.4.0: Building Memory Into the Harness

> **Original**: [Tweet](https://x.com/strickvl/status/2043620630273343925) · Alex Strick van Linschoten ([@strickvl](https://x.com/strickvl)) · April 13, 2026
> **Category**: Practice / Implementation

---

## Overview

After Harrison Chase proposed "Your Harness, Your Memory," the Kitaru team was among the first to implement this vision. Kitaru 0.4.0 builds the memory system directly into the harness foundation, rather than relying on external memory services.

---

## Three Design Decisions

### 1. Versioning Comes Free

Every `memory.set()` creates a new version. Soft deletes leave tombstones. You can ask "which run taught the agent this?" and get a real answer.

### 2. Scoping Matches How Agents Actually Work

- **Namespace** — Project/repo-level conventions
- **Flow** — Each agent's learning state
- **Execution** — Per-run progress

No need to stuff everything into a single global blob.

### 3. Provenance Is Automated

Since memory and artifacts share the same backend, audit trails don't need to be stitched together across systems.

---

## Why Not External Memory Providers?

The Kitaru team considered integrating dedicated memory services like Mem0 and Letta. But once they mapped out what versioning and provenance would look like across two systems, the "seams" started showing.

> *"Managing memory is a core responsibility of the harness, not a peripheral one."*

This echoes Harrison Chase's core point: memory should not be outsourced to third parties.

---

*See also: [Memory Systems](../guide/memory.md) · [OpenAI: Harness Engineering](openai-harness-engineering.md)*
