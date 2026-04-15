---
author: Nexu
---

# Guardrails

> **Core Insight:** An agent without guardrails is a liability. The model will do exactly what it's told — including what a prompt injection tells it to do. Guardrails are the permission layer between "the model wants to do X" and "the harness actually does X."

## Why Guardrails Exist

The model generates text. That text includes tool calls. The harness executes those tool calls. This means anything that influences the model's output can influence what the harness does — including malicious content in files, web pages, or user messages.

This is **prompt injection**: an attacker embeds instructions in data the agent reads, and the model follows those instructions instead of the original task. Without guardrails, a prompt injection can:

- Delete files (`rm -rf /`)
- Exfiltrate environment variables (API keys, tokens)
- Execute arbitrary code on the host
- Send unauthorized messages on behalf of the user

Guardrails make the harness the final authority on what actions are permitted, regardless of what the model requests.

## The Trust Boundary Model

Every harness has a trust boundary between the model and the operating environment. The harness mediates all crossings:

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

The guardrail layer intercepts every tool call before execution. It can:
- **Allow** — execute as requested
- **Deny** — return an error to the model
- **Modify** — rewrite the call (e.g., restrict file path to a safe directory)
- **Prompt** — ask the human for approval before proceeding

## Permission Models

### Allow-list (Strictest)

Only explicitly permitted actions are allowed. Everything else is denied by default:

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

### Deny-list (Permissive)

Everything is allowed except explicitly blocked actions:

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

### Tiered Approval

Different risk levels trigger different approval flows:

| Risk Level | Examples | Action |
|-----------|----------|--------|
| **Low** | Read files, search | Auto-approve |
| **Medium** | Write files, run tests | Auto-approve with logging |
| **High** | Execute shell commands, network requests | Require human approval |
| **Critical** | Delete files, push to git, send messages | Always require explicit approval |

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

## Sandboxing

Guardrails enforce policy; sandboxes enforce isolation. A sandbox is a restricted execution environment that limits what code can do at the OS level:

| Technology | Isolation Level | Overhead | Use Case |
|-----------|----------------|----------|----------|
| **chroot** | Filesystem only | Minimal | Basic path restriction |
| **Docker** | Process + filesystem + network | Low | Development, CI/CD |
| **Firecracker microVM** | Full VM | Medium | Production multi-tenant |
| **gVisor** | Syscall-level | Low-Medium | High-security workloads |
| **WASM** | Language-level | Minimal | In-browser agents |

Most production harnesses use Docker for development and Firecracker (or equivalent) for production. The key principle: **the agent's code execution should never have access to the host filesystem, network, or process space**.

## Input Sanitization

Beyond tool-level guardrails, the harness should sanitize inputs to reduce prompt injection risk:

```python
def sanitize_tool_result(result: str, max_length: int = 50_000) -> str:
    """Truncate and mark external content as untrusted."""
    if len(result) > max_length:
        result = result[:max_length] + "\n[TRUNCATED]"
    # Wrap in markers so the model knows this is external data
    return f"<tool_result>\n{result}\n</tool_result>"
```

Content from external sources (web pages, user-uploaded files, API responses) should be clearly demarcated in the context so the model can distinguish instructions from data.

## Common Pitfalls

- **No guardrails at all** — The default for most hobby harnesses. Fine for local development, disastrous for production.
- **Guardrails in the prompt only** — Telling the model "don't delete files" is not a guardrail. The model can be overridden by prompt injection. True guardrails are enforced in code, not in text.
- **Overly restrictive permissions** — An agent that can't do anything useful won't be used. Balance security with utility.
- **Not logging denied actions** — Understanding what the agent *tried* to do but was blocked from doing is critical for debugging and improving prompts.

## Further Reading

- [Simon Willison: Prompt Injection](https://simonwillison.net/series/prompt-injection/) — Comprehensive series on the threat model
- [Anthropic: Mitigating Prompt Injection](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) — Practical defense patterns
