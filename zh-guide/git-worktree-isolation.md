# Git Worktree 隔离

Git worktree 允许你将同一个仓库的多个分支同时检出到不同目录。对 Agent 系统而言，这意味着多个 Agent 可以并行处理同一个代码库——各自在自己的分支、自己的目录里工作——完全没有冲突风险。

## 为什么重要

当两个 Agent 同时编辑同一个仓库时，它们会冲突：一个覆盖另一个的修改，merge conflict 不断累积，代码库最终处于不一致状态。Git worktree 彻底消除了这个问题。每个 Agent 在一个隔离的副本中工作，共享同一个 `.git` 历史但拥有独立的工作目录。它们不会互相踩脚，修改通过正常的 Git 流程干净地合并。

## 基本用法

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

关键特性：
- **共享 `.git`** — 所有 worktree 共享同一个对象数据库（无磁盘重复）
- **独立分支** — 每个 worktree 在不同分支上
- **独立工作目录** — 一个 worktree 的修改不影响其他的
- **每个 worktree 一个分支** — 不能在两个 worktree 中检出同一个分支

## Agent 启动脚本

一个完整的脚本，用于在隔离的 worktree 中启动 Agent：

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

用法：

```bash
# Spawn 3 agents in parallel
./spawn-agent.sh ~/projects/my-app agent/fix-auth "Fix the JWT token validation bug" &
./spawn-agent.sh ~/projects/my-app agent/add-tests "Add unit tests for user service" &
./spawn-agent.sh ~/projects/my-app agent/update-api "Update the v2 REST API endpoints" &

wait  # Wait for all to finish
echo "All agents done!"
```

## Python 编排器

一个更完善的版本，带错误处理和状态追踪：

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

## 磁盘空间与性能

Worktree 很轻量，因为它们共享 Git 对象数据库：

```
普通 clone：        150 MB（完整仓库副本）
Worktree：          ~5 MB（仅工作目录文件，共享 .git）
3 个 worktree：     ~15 MB（对比 3 个 clone 的 450 MB）
```

但要注意 `node_modules` 和构建产物：

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

## 清理

Worktree 应该是临时的。任务完成后及时清理：

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

## 常见陷阱

- **在同一个分支上运行两个 worktree** — Git 禁止这样做。每个 worktree 必须在唯一的分支上。使用命名规范：`agent/<task-slug>-<timestamp>`。
- **忘记清理** — 过期的 worktree 不会自动删除。如果 Agent 进程崩溃，worktree 会残留并不断累积。定期运行 `git worktree prune`。
- **共享 `node_modules` 或构建缓存** — 每个 worktree 是独立的目录树，不能共享 `node_modules`。预留足够的磁盘空间，或者改用 CI 来处理重度构建。

## 延伸阅读

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree) — 官方参考文档
- [GitHub CLI (`gh`)](https://cli.github.com/) — 上述脚本中用于创建 PR
- [Multi-Agent Patterns](multi-agent.md) — 并行 Agent 工作的更广泛背景

---

*下一篇：[沙箱与安全 →](sandbox-security.md)*
