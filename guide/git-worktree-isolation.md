# Git Worktree Isolation

Git worktree lets you check out multiple branches of the same repository into separate directories simultaneously. For agent systems, this means multiple agents can work on the same codebase in parallel — each on its own branch, in its own directory — with zero conflict risk.

## Why It Matters

When two agents edit the same repository at the same time, they collide: one overwrites the other's changes, merge conflicts pile up, and the codebase ends up in an inconsistent state. Git worktrees eliminate this entirely. Each agent works in an isolated copy that shares the same `.git` history but has its own working directory. They can't step on each other, and their changes merge cleanly through normal Git workflows.

## The Basics

```bash
# You have a main checkout
cd ~/projects/my-app
git status
# On branch main

# Create worktrees for parallel agent tasks
git worktree add ../my-app-fix-auth -b agent/fix-auth
git worktree add ../my-app-add-tests -b agent/add-tests
git worktree add ../my-app-update-api -b agent/update-api

# Each worktree is a full working directory
ls ../my-app-fix-auth/
# src/  tests/  package.json  README.md  ...

# List active worktrees
git worktree list
# /Users/dev/projects/my-app              abc1234 [main]
# /Users/dev/projects/my-app-fix-auth     abc1234 [agent/fix-auth]
# /Users/dev/projects/my-app-add-tests    abc1234 [agent/add-tests]
# /Users/dev/projects/my-app-update-api   abc1234 [agent/update-api]
```

Key properties:
- **Shared `.git`** — all worktrees share the same object database (no disk duplication)
- **Independent branches** — each worktree is on a different branch
- **Independent working directory** — changes in one don't affect others
- **One branch per worktree** — you can't check out the same branch in two worktrees

## Agent Spawn Script

A complete script to spawn an agent in an isolated worktree:

```bash
#!/bin/bash
# spawn-agent.sh — Create a worktree and run an agent in it
set -euo pipefail

REPO_DIR="${1:?Usage: spawn-agent.sh <repo-dir> <branch-name> <task>}"
BRANCH="${2:?}"
TASK="${3:?}"

WORKTREE_DIR="${REPO_DIR}-${BRANCH//\//-}"

echo "🔧 Creating worktree: $WORKTREE_DIR (branch: $BRANCH)"

# Create worktree from current HEAD
git -C "$REPO_DIR" worktree add "$WORKTREE_DIR" -b "$BRANCH" 2>/dev/null || {
    # Branch exists, just create worktree
    git -C "$REPO_DIR" worktree add "$WORKTREE_DIR" "$BRANCH"
}

# Install dependencies (if needed)
if [ -f "$WORKTREE_DIR/package.json" ]; then
    echo "📦 Installing Node dependencies..."
    cd "$WORKTREE_DIR" && npm ci --silent
fi

if [ -f "$WORKTREE_DIR/requirements.txt" ]; then
    echo "📦 Installing Python dependencies..."
    pip install -r "$WORKTREE_DIR/requirements.txt" -q
fi

# Run the agent
echo "🤖 Starting agent on task: $TASK"
python agent.py --workspace "$WORKTREE_DIR" --task "$TASK"

# After agent finishes: commit, push, create PR
cd "$WORKTREE_DIR"
git add -A
git commit -m "agent($BRANCH): $TASK" || echo "Nothing to commit"
git push origin "$BRANCH" 2>/dev/null || git push --set-upstream origin "$BRANCH"

echo "📤 Creating PR..."
gh pr create --title "Agent: $TASK" --body "Automated fix by agent on branch $BRANCH" --base main

# Cleanup
echo "🧹 Removing worktree..."
git -C "$REPO_DIR" worktree remove "$WORKTREE_DIR" --force
```

Usage:

```bash
# Spawn 3 agents in parallel
./spawn-agent.sh ~/projects/my-app agent/fix-auth "Fix the JWT token validation bug" &
./spawn-agent.sh ~/projects/my-app agent/add-tests "Add unit tests for user service" &
./spawn-agent.sh ~/projects/my-app agent/update-api "Update the v2 REST API endpoints" &

wait  # Wait for all to finish
echo "All agents done!"
```

## Python Orchestrator

A more sophisticated version with error handling and status tracking:

```python
import subprocess
import os
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

@dataclass
class AgentTask:
    branch: str
    task: str
    worktree_dir: str = ""
    status: str = "pending"  # pending, running, done, failed
    result: str = ""
    pr_url: str = ""

class WorktreeOrchestrator:
    def __init__(self, repo_dir: str):
        self.repo_dir = os.path.abspath(repo_dir)
        self.tasks: list[AgentTask] = []

    def add_task(self, branch: str, task: str):
        worktree = f"{self.repo_dir}-{branch.replace('/', '-')}"
        self.tasks.append(AgentTask(branch=branch, task=task, worktree_dir=worktree))

    def _run_in_worktree(self, task: AgentTask) -> AgentTask:
        """Execute a single agent task in its own worktree."""
        task.status = "running"

        try:
            # Create worktree
            subprocess.run(
                ["git", "worktree", "add", task.worktree_dir, "-b", task.branch],
                cwd=self.repo_dir, check=True, capture_output=True
            )

            # Run the agent (replace with your agent invocation)
            result = subprocess.run(
                ["python", "agent.py", "--task", task.task],
                cwd=task.worktree_dir,
                capture_output=True, text=True, timeout=300
            )
            task.result = result.stdout

            # Commit changes
            subprocess.run(["git", "add", "-A"], cwd=task.worktree_dir, check=True)
            commit = subprocess.run(
                ["git", "commit", "-m", f"agent: {task.task[:60]}"],
                cwd=task.worktree_dir, capture_output=True, text=True
            )

            if commit.returncode == 0:
                # Push and create PR
                subprocess.run(
                    ["git", "push", "-u", "origin", task.branch],
                    cwd=task.worktree_dir, check=True, capture_output=True
                )
                pr = subprocess.run(
                    ["gh", "pr", "create", "--title", f"Agent: {task.task[:60]}",
                     "--body", f"Automated change.\n\nTask: {task.task}",
                     "--base", "main"],
                    cwd=task.worktree_dir, capture_output=True, text=True
                )
                task.pr_url = pr.stdout.strip()

            task.status = "done"

        except subprocess.TimeoutExpired:
            task.status = "failed"
            task.result = "Timeout: agent took longer than 300s"
        except Exception as e:
            task.status = "failed"
            task.result = str(e)
        finally:
            # Always clean up worktree
            subprocess.run(
                ["git", "worktree", "remove", task.worktree_dir, "--force"],
                cwd=self.repo_dir, capture_output=True
            )

        return task

    def run_all(self, max_parallel: int = 3) -> list[AgentTask]:
        """Run all tasks in parallel worktrees."""
        with ThreadPoolExecutor(max_workers=max_parallel) as pool:
            futures = {pool.submit(self._run_in_worktree, t): t for t in self.tasks}
            for future in as_completed(futures):
                task = future.result()
                emoji = "✅" if task.status == "done" else "❌"
                print(f"{emoji} {task.branch}: {task.status}")
                if task.pr_url:
                    print(f"   PR: {task.pr_url}")

        return self.tasks

# Usage
orch = WorktreeOrchestrator("~/projects/my-app")
orch.add_task("agent/fix-auth", "Fix JWT validation in auth middleware")
orch.add_task("agent/add-tests", "Add tests for user registration flow")
orch.add_task("agent/refactor-db", "Refactor database queries to use connection pool")
results = orch.run_all(max_parallel=3)
```

## Disk Space and Performance

Worktrees are lightweight because they share the Git object database:

```
Regular clone:    150 MB (full repo copy)
Worktree:          ~5 MB (working directory files only, shared .git)
3 worktrees:      ~15 MB (vs 450 MB for 3 clones)
```

But watch out for `node_modules` and build artifacts:

```bash
# Each worktree needs its own node_modules (can't share)
# 3 worktrees × 500MB node_modules = 1.5GB

# Solution: use npm workspaces or symlink shared deps
# Or just accept the cost — it's temporary

# Better solution: only install if the task needs it
if grep -q "npm test" "$WORKTREE_DIR/agent-task.json"; then
    cd "$WORKTREE_DIR" && npm ci
fi
```

## Cleanup

Worktrees should be ephemeral. Clean up after tasks complete:

```bash
# Remove a specific worktree
git worktree remove ../my-app-fix-auth

# Remove all stale worktrees (directory already deleted)
git worktree prune

# Nuclear option: remove all non-main worktrees
git worktree list --porcelain | grep "^worktree" | grep -v "$(git rev-parse --show-toplevel)" | \
  awk '{print $2}' | xargs -I{} git worktree remove {} --force

# Cron job for cleanup (run daily)
# 0 3 * * * cd ~/projects/my-app && git worktree prune
```

## Common Pitfalls

- **Running two worktrees on the same branch** — Git forbids this. Each worktree must be on a unique branch. Use a naming convention: `agent/<task-slug>-<timestamp>`.
- **Forgetting to clean up** — Stale worktrees don't auto-delete. If agent processes crash, worktrees persist and accumulate. Use `git worktree prune` regularly.
- **Sharing `node_modules` or build caches** — Each worktree is a separate directory tree. They can't share `node_modules`. Budget disk space accordingly or use CI instead for heavy builds.

## Further Reading

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree) — Official reference
- [GitHub CLI (`gh`)](https://cli.github.com/) — Used for PR creation in the scripts above
- [Multi-Agent Patterns](multi-agent.md) — The broader context for parallel agent work
