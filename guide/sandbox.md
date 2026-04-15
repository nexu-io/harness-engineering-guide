---
author: Nexu
---

# Sandbox

> **Core Insight:** An agent with shell access can `rm -rf /`. A sandbox is the difference between a useful coding assistant and a liability. The model should feel unrestricted; the execution environment should be anything but.

## Why Sandbox?

When an agent runs code, installs packages, or executes shell commands, it's operating with real system privileges. Without isolation, a single hallucinated `curl ... | bash` can exfiltrate data, install malware, or destroy the host. Sandboxing constrains the blast radius — even if the agent does something dangerous, the damage is contained.

The three threat vectors:
1. **Data exfiltration** — agent reads secrets and sends them to an external server
2. **Destructive operations** — agent deletes files, corrupts databases, modifies system config
3. **Privilege escalation** — agent escapes its sandbox to access the host

A production sandbox addresses all three simultaneously.

## Docker Sandbox Setup

Docker is the most common sandbox for single-tenant agent deployments. The key is running with restrictive defaults and only relaxing what's explicitly needed:

```dockerfile
# Dockerfile.sandbox
FROM python:3.12-slim

# Non-root user — never run agents as root
RUN useradd -m -s /bin/bash agent
WORKDIR /workspace

# Install common tools (locked versions, no auto-update)
RUN pip install --no-cache-dir \
    ruff==0.4.4 \
    pytest==8.2.0 \
    httpx==0.27.0

# Drop all capabilities, agent gets only what's listed
USER agent
```

The `docker run` invocation matters more than the Dockerfile — this is where the actual restrictions are enforced:

```python
import subprocess
import tempfile
import json
from pathlib import Path


class DockerSandbox:
    """Execute agent commands inside a restricted Docker container."""

    def __init__(
        self,
        image: str = "agent-sandbox:latest",
        workspace: str | None = None,
        timeout: int = 30,
        memory_limit: str = "512m",
        network: bool = False,
    ):
        self.image = image
        self.workspace = workspace or tempfile.mkdtemp(prefix="agent-")
        self.timeout = timeout
        self.memory_limit = memory_limit
        self.network = network

    def execute(self, command: str) -> dict:
        """Run a command in the sandbox and return stdout/stderr/exit code."""
        docker_cmd = [
            "docker", "run",
            "--rm",                              # Auto-cleanup
            "--user", "1000:1000",               # Non-root
            "--memory", self.memory_limit,       # OOM protection
            "--cpus", "1.0",                     # CPU limit
            "--pids-limit", "100",               # Fork bomb protection
            "--read-only",                       # Read-only root filesystem
            "--tmpfs", "/tmp:size=100m",         # Writable temp space
            "--tmpfs", "/workspace:size=200m",   # Writable workspace
            "--security-opt", "no-new-privileges",
            "--cap-drop", "ALL",                 # Drop all Linux capabilities
        ]

        # Mount workspace files as read-only input
        if Path(self.workspace).exists():
            docker_cmd.extend([
                "-v", f"{self.workspace}:/input:ro"
            ])

        # Network isolation (default: no network)
        if not self.network:
            docker_cmd.extend(["--network", "none"])

        docker_cmd.extend([self.image, "bash", "-c", command])

        try:
            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            return {
                "stdout": result.stdout[-10_000:],  # Truncate large output
                "stderr": result.stderr[-5_000:],
                "exit_code": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": f"Command timed out after {self.timeout}s",
                "exit_code": -1,
            }
```

The critical flags:
- `--read-only` makes the root filesystem immutable. The agent can't modify system binaries or install persistent backdoors.
- `--network none` prevents all network access. The agent can't exfiltrate data or download malicious payloads.
- `--cap-drop ALL` removes Linux capabilities. No `ptrace`, no `mount`, no `chown`.
- `--tmpfs` provides writable scratch space that vanishes when the container exits.

## Firecracker MicroVMs for Multi-Tenant

Docker provides process-level isolation, which is sufficient for single-tenant use. Multi-tenant (multiple untrusted users sharing a host) demands stronger guarantees — a container escape affects all tenants. Firecracker microVMs solve this:

```
┌──────────────────────────────────────┐
│  Host Machine                        │
│  ┌────────────┐  ┌────────────┐     │
│  │ MicroVM    │  │ MicroVM    │     │
│  │ (User A)   │  │ (User B)   │     │
│  │ ┌────────┐ │  │ ┌────────┐ │     │
│  │ │ Agent  │ │  │ │ Agent  │ │     │
│  │ └────────┘ │  │ └────────┘ │     │
│  └────────────┘  └────────────┘     │
│  Firecracker VMM                     │
│  KVM hypervisor boundary             │
└──────────────────────────────────────┘
```

Each microVM boots in ~125ms with a minimal Linux kernel. The hypervisor boundary means a kernel exploit inside the VM cannot reach the host or other VMs:

```python
import json
import socket


class FirecrackerSandbox:
    """Manage a Firecracker microVM for agent execution."""

    def __init__(self, socket_path: str, kernel: str, rootfs: str):
        self.socket_path = socket_path
        self.kernel = kernel
        self.rootfs = rootfs

    def configure(self, vcpus: int = 1, mem_mb: int = 256):
        """Configure the microVM resources."""
        self._api_call("PUT", "/machine-config", {
            "vcpu_count": vcpus,
            "mem_size_mib": mem_mb,
        })
        self._api_call("PUT", "/boot-source", {
            "kernel_image_path": self.kernel,
            "boot_args": "console=ttyS0 reboot=k panic=1 pci=off",
        })
        self._api_call("PUT", "/drives/rootfs", {
            "drive_id": "rootfs",
            "path_on_host": self.rootfs,
            "is_root_device": True,
            "is_read_only": False,
        })

    def start(self):
        """Boot the microVM."""
        self._api_call("PUT", "/actions", {"action_type": "InstanceStart"})

    def stop(self):
        """Shut down the microVM."""
        self._api_call("PUT", "/actions", {"action_type": "SendCtrlAltDel"})

    def _api_call(self, method: str, path: str, body: dict):
        """Make an API call to the Firecracker socket."""
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(self.socket_path)
        payload = json.dumps(body)
        request = (
            f"{method} {path} HTTP/1.1\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(payload)}\r\n"
            f"\r\n{payload}"
        )
        sock.sendall(request.encode())
        response = sock.recv(4096).decode()
        sock.close()
        return response
```

## Permission Enforcement at the OS Level

Beyond container isolation, enforce permissions within the sandbox using Linux security modules:

```bash
# seccomp profile — restrict system calls
# sandbox-seccomp.json
{
    "defaultAction": "SCMP_ACT_ERRNO",
    "syscalls": [
        {
            "names": ["read", "write", "open", "close", "stat", "fstat",
                       "mmap", "mprotect", "munmap", "brk", "execve",
                       "access", "pipe", "dup2", "fork", "wait4", "exit_group"],
            "action": "SCMP_ACT_ALLOW"
        }
    ]
}
```

Apply it with `--security-opt seccomp=sandbox-seccomp.json` in your Docker run command. The agent can read, write, and execute — but not mount filesystems, load kernel modules, or create raw sockets.

## Network Isolation

`--network none` blocks all traffic, but some agents need *limited* network access (e.g., `pip install` or API calls). Use a network policy to allow only specific destinations:

```python
NETWORK_ALLOWLIST = [
    "pypi.org:443",
    "files.pythonhosted.org:443",
    "api.openai.com:443",
]

def create_sandbox_network():
    """Create a Docker network with egress restrictions via iptables."""
    subprocess.run([
        "docker", "network", "create",
        "--driver", "bridge",
        "--opt", "com.docker.network.bridge.enable_icc=false",
        "agent-sandbox-net",
    ], check=True)

    # Allow only specific destinations
    for target in NETWORK_ALLOWLIST:
        host, port = target.split(":")
        subprocess.run([
            "iptables", "-A", "DOCKER-USER",
            "-d", host,
            "-p", "tcp", "--dport", port,
            "-j", "ACCEPT",
        ], check=True)

    # Drop everything else
    subprocess.run([
        "iptables", "-A", "DOCKER-USER", "-j", "DROP",
    ], check=True)
```

## File System Restrictions

Layer multiple filesystem controls:

```python
def build_volume_mounts(workspace: str, readonly_dirs: list[str]) -> list[str]:
    """Construct Docker volume mount arguments."""
    mounts = [
        # Agent workspace — read-write, but scoped
        f"-v {workspace}:/workspace:rw",
        # Temp space — in-memory, size-limited
        "--tmpfs /tmp:size=100m,noexec",
    ]
    # Read-only reference directories
    for d in readonly_dirs:
        mounts.append(f"-v {d}:{d}:ro")
    return mounts

# Example: agent can read source code but only write to /workspace
mounts = build_volume_mounts(
    workspace="/tmp/agent-work-abc123",
    readonly_dirs=["/opt/project/src", "/opt/project/tests"],
)
```

The `noexec` flag on `/tmp` prevents the agent from writing scripts to temp and executing them — a common escape technique.

## Putting It Together

A production sandbox executor combines all layers:

```python
class ProductionSandbox:
    """Full-featured sandbox with layered security."""

    def __init__(self, config: dict):
        self.docker = DockerSandbox(
            image=config["image"],
            timeout=config.get("timeout", 30),
            memory_limit=config.get("memory", "512m"),
            network=config.get("network", False),
        )

    def run_tool(self, tool_name: str, command: str) -> str:
        """Execute a tool command in the sandbox."""
        # Log every execution for audit
        log_entry = {"tool": tool_name, "command": command}
        audit_log.append(log_entry)

        result = self.docker.execute(command)

        if result["exit_code"] != 0:
            return f"Error (exit {result['exit_code']}):\n{result['stderr']}"
        return result["stdout"]
```

## Common Pitfalls

- **Running as root** — The most common sandbox mistake. Even inside Docker, root can modify the container's filesystem, install packages, and potentially exploit kernel vulnerabilities. Always use a non-root user.
- **Forgetting `--network none`** — Without explicit network denial, the container inherits the host's network. An agent can `curl` secrets to any server.
- **Persistent containers** — If the sandbox container persists between calls, the agent can accumulate state, install backdoors, or set up cron jobs. Use ephemeral containers (`--rm`) by default.
- **Trusting the agent's output** — A sandboxed `cat /etc/passwd` still returns real data if the file is mounted. Mount only what's needed, and mount it read-only.

## Further Reading

- [Firecracker: Lightweight Virtualization](https://firecracker-microvm.github.io/) — The microVM engine powering AWS Lambda and Fly.io
- [Docker Security Best Practices](https://docs.docker.com/engine/security/) — Capabilities, seccomp, and AppArmor profiles
- [E2B: Open Source Sandbox](https://e2b.dev/) — Cloud sandbox service purpose-built for AI agents
