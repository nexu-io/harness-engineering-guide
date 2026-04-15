---
author: Nexu
---

# Guardrails

> **Core Insight:** 没有 Guardrails 的 Agent 就是个隐患。模型会严格执行指令——包括 prompt 注入告诉它的指令。Guardrails 是"模型想做 X"和"Harness 真正执行 X"之间的权限层。

## 为什么需要 Guardrails

模型生成文本。文本包含 Tool 调用。Harness 执行这些 Tool 调用。这意味着任何影响模型输出的东西都能影响 Harness 的行为——包括文件、网页或用户消息中的恶意内容。

这就是 **prompt 注入**：攻击者在 Agent 读取的数据中嵌入指令，模型执行这些指令而非原始任务。没有 Guardrails 的话，prompt 注入可以：

- 删除文件（`rm -rf /`）
- 窃取环境变量（API 密钥、Token）
- 在宿主机上执行任意代码
- 以用户身份发送未授权消息

Guardrails 让 Harness 成为行为的最终裁决者，无论模型请求什么。

## 信任边界模型

每个 Harness 在模型和操作环境之间都有一个信任边界。Harness 负责调解所有跨越：

```
┌──────────────────────────────────┐
│           MODEL SPACE            │
│  (reasoning, tool call requests) │
└────────────┬─────────────────────┘
             │ tool call request
             ▼
┌──────────────────────────────────┐
│         GUARDRAIL LAYER          │
│  Permission check → Allow/Deny   │
└────────────┬─────────────────────┘
             │ approved call
             ▼
┌──────────────────────────────────┐
│        EXECUTION SPACE           │
│  (filesystem, network, shell)    │
└──────────────────────────────────┘
```

Guardrails 层拦截每个 Tool 调用，在执行前进行检查。它可以：
- **允许** —— 按请求执行
- **拒绝** —— 返回错误给模型
- **修改** —— 重写调用（如限制文件路径到安全目录）
- **询问** —— 在执行前请求人类批准

## 权限模型

### 白名单模式（最严格）

只允许明确许可的操作。其他一律拒绝：

```python
ALLOWED_TOOLS = {
    "read_file": {"paths": ["/workspace/**"]},
    "write_file": {"paths": ["/workspace/**"]},
    "run_command": {"commands": ["npm test", "npm run build"]},
}

def check_permission(tool_name: str, args: dict) -> bool:
    if tool_name not in ALLOWED_TOOLS:
        return False
    policy = ALLOWED_TOOLS[tool_name]
    if "paths" in policy:
        return any(fnmatch(args.get("path", ""), p) for p in policy["paths"])
    if "commands" in policy:
        return args.get("command") in policy["commands"]
    return True
```

### 黑名单模式（最宽松）

除了明确封禁的操作，其他一律允许：

```python
BLOCKED_PATTERNS = [
    (r"rm\s+-rf\s+/", "Refusing to delete root filesystem"),
    (r"curl.*\|\s*sh", "Refusing to pipe remote script to shell"),
    (r"env\s+|printenv|echo\s+\$", "Refusing to expose environment variables"),
]

def check_command(command: str) -> tuple[bool, str]:
    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, command):
            return False, reason
    return True, ""
```

### 分级审批

不同风险级别触发不同审批流程：

| 风险级别 | 示例 | 处理方式 |
|-----------|----------|--------|
| **低** | 读文件、搜索 | 自动批准 |
| **中** | 写文件、跑测试 | 自动批准 + 记录日志 |
| **高** | 执行 Shell 命令、网络请求 | 需要人类批准 |
| **关键** | 删除文件、git push、发消息 | 始终要求明确批准 |

```python
def get_risk_level(tool_name: str, args: dict) -> str:
    if tool_name == "read_file":
        return "low"
    if tool_name == "write_file":
        return "medium"
    if tool_name == "run_command":
        cmd = args.get("command", "")
        if any(k in cmd for k in ["rm", "git push", "curl"]):
            return "critical"
        return "high"
    return "medium"
```

## Sandbox

Guardrails 执行策略；Sandbox 执行隔离。Sandbox 是一个受限的执行环境，在操作系统层面限制代码的行为：

| 技术 | 隔离级别 | 开销 | 适用场景 |
|-----------|----------------|----------|----------|
| **chroot** | 仅文件系统 | 极小 | 基础路径限制 |
| **Docker** | 进程 + 文件系统 + 网络 | 低 | 开发、CI/CD |
| **Firecracker microVM** | 完整虚拟机 | 中等 | 生产多租户 |
| **gVisor** | 系统调用级 | 中低 | 高安全工作负载 |
| **WASM** | 语言级 | 极小 | 浏览器内 Agent |

大多数生产 Harness 开发用 Docker，生产用 Firecracker（或同类方案）。核心原则：**Agent 的代码执行永远不应该访问宿主文件系统、网络或进程空间**。

## 输入消毒

除了 Tool 级 Guardrails，Harness 还应对输入进行消毒以降低 prompt 注入风险：

```python
def sanitize_tool_result(result: str, max_length: int = 50_000) -> str:
    """Truncate and mark external content as untrusted."""
    if len(result) > max_length:
        result = result[:max_length] + "\n[TRUNCATED]"
    # Wrap in markers so the model knows this is external data
    return f"<tool_result>\n{result}\n</tool_result>"
```

来自外部源（网页、用户上传文件、API 响应）的内容应在 Context 中被明确标记，让模型能区分指令和数据。

## 常见误区

- **完全没有 Guardrails** —— 大多数业余 Harness 的现状。本地开发没问题，上生产就是灾难。
- **Guardrails 只放在 prompt 里** —— 告诉模型"不要删文件"不是 Guardrails。模型可以被 prompt 注入覆盖。真正的 Guardrails 在代码中执行，不在文本中。
- **权限过于严格** —— 什么都干不了的 Agent 不会有人用。在安全和实用之间找平衡。
- **不记录被拒绝的操作** —— 了解 Agent *试图*做但被阻止的事情，对调试和改进 prompt 至关重要。

## 延伸阅读

- [Simon Willison: Prompt Injection](https://simonwillison.net/series/prompt-injection/) —— 关于威胁模型的全面系列
- [Anthropic: Mitigating Prompt Injection](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) —— 实用防御模式
