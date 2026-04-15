# Security & Sandboxing

## Why Security in Harness Engineering?

AI agents execute code, read files, call APIs, and interact with external systems. A poorly secured harness is a remote code execution vulnerability with a chat interface.

## Permission Models

### Allowlist (Restrictive)
Only explicitly permitted tools and actions are available.
```
tools:
  allowed: [read_file, web_search, exec_sandboxed]
  denied: [rm, sudo, network_admin]
```

### Capability-Based
Agents request capabilities, and the harness grants or denies them.
```
Agent: "I need to write to /tmp/output.txt"
Harness: ✅ Granted (within sandbox)

Agent: "I need to access ~/.ssh/id_rsa"  
Harness: ❌ Denied (outside trust boundary)
```

### Human-in-the-Loop
Sensitive actions require explicit user approval.
- Low risk: auto-approve (reading files, searching)
- Medium risk: notify + proceed unless stopped
- High risk: pause and wait for explicit approval (sending emails, deploying)

## Sandbox Architectures

| Architecture | Isolation Level | Performance | Use Case |
|-------------|----------------|-------------|----------|
| **Process sandbox** | Medium | Fast | Local development |
| **Docker container** | High | Medium | Production agents |
| **Firecracker/microVM** | Very high | Slower | Multi-tenant platforms |
| **WASM sandbox** | Medium-high | Fast | Browser-based agents |

## Trust Boundaries

```
┌─ Fully Trusted ─────────────────────┐
│  Agent config, system prompt         │
├─ Trusted with Verification ─────────┤
│  User messages, uploaded files       │
├─ Untrusted ─────────────────────────┤
│  Web content, API responses,         │
│  other agents' output                │
├─ Never Trusted ─────────────────────┤
│  Prompt injection attempts,          │
│  unknown tool outputs                │
└─────────────────────────────────────┘
```

### Key Principles
1. **Least privilege** — Agents get only the permissions they need
2. **Defense in depth** — Multiple layers of protection
3. **Fail safe** — When in doubt, deny and ask the user
4. **Audit trail** — Log all sensitive actions for review

---

*Back to [README →](../README.md)*
