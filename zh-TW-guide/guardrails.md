---
author: Nexu
---

# Guardrails

> **Core Insight:** 沒有 Guardrails 的 Agent 就是個隱患。模型會嚴格執行指令——包括 prompt 注入告訴它的指令。Guardrails 是"模型想做 X"和"Harness 真正執行 X"之間的權限層。

## 為什麼需要 Guardrails

模型生成文本。文本包含 Tool 呼叫。Harness 執行這些 Tool 呼叫。這意味著任何影響模型輸出的東西都能影響 Harness 的行為——包括檔案、網頁或使用者訊息中的惡意內容。

這就是 **prompt 注入**：攻擊者在 Agent 讀取的資料中嵌入指令，模型執行這些指令而非原始任務。沒有 Guardrails 的話，prompt 注入可以：

- 刪除檔案（`rm -rf /`）
- 竊取環境變數（API 金鑰、Token）
- 在宿主機上執行任意程式碼
- 以使用者身份傳送未授權訊息

Guardrails 讓 Harness 成為行為的最終裁決者，無論模型請求什麼。

## 信任邊界模型

每個 Harness 在模型和操作環境之間都有一個信任邊界。Harness 負責調解所有跨越：

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

Guardrails 層攔截每個 Tool 呼叫，在執行前進行檢查。它可以：
- **允許** —— 按請求執行
- **拒絕** —— 返回錯誤給模型
- **修改** —— 重寫呼叫（如限制檔案路徑到安全目錄）
- **詢問** —— 在執行前請求人類批准

## 權限模型

### 白名單模式（最嚴格）

只允許明確許可的操作。其他一律拒絕：

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

### 黑名單模式（最寬鬆）

除了明確封禁的操作，其他一律允許：

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

### 分級審批

不同風險級別觸發不同審批流程：

| 風險級別 | 示例 | 處理方式 |
|-----------|----------|--------|
| **低** | 讀檔案、搜尋 | 自動批准 |
| **中** | 寫檔案、跑測試 | 自動批准 + 記錄日誌 |
| **高** | 執行 Shell 命令、網路請求 | 需要人類批准 |
| **關鍵** | 刪除檔案、git push、發訊息 | 始終要求明確批准 |

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

Guardrails 執行策略；Sandbox 執行隔離。Sandbox 是一個受限的執行環境，在作業系統層面限制程式碼的行為：

| 技術 | 隔離級別 | 開銷 | 適用場景 |
|-----------|----------------|----------|----------|
| **chroot** | 僅檔案系統 | 極小 | 基礎路徑限制 |
| **Docker** | 程序 + 檔案系統 + 網路 | 低 | 開發、CI/CD |
| **Firecracker microVM** | 完整虛擬機器 | 中等 | 生產多租戶 |
| **gVisor** | 系統呼叫級 | 中低 | 高安全工作負載 |
| **WASM** | 語言級 | 極小 | 瀏覽器內 Agent |

大多數生產 Harness 開發用 Docker，生產用 Firecracker（或同類方案）。核心原則：**Agent 的程式碼執行永遠不應該訪問宿主檔案系統、網路或程序空間**。

## 輸入消毒

除了 Tool 級 Guardrails，Harness 還應對輸入進行消毒以降低 prompt 注入風險：

```python
def sanitize_tool_result(result: str, max_length: int = 50_000) -> str:
    """Truncate and mark external content as untrusted."""
    if len(result) > max_length:
        result = result[:max_length] + "\n[TRUNCATED]"
    # Wrap in markers so the model knows this is external data
    return f"<tool_result>\n{result}\n</tool_result>"
```

來自外部源（網頁、使用者上傳檔案、API 響應）的內容應在 Context 中被明確標記，讓模型能區分指令和資料。

## 常見誤區

- **完全沒有 Guardrails** —— 大多數業餘 Harness 的現狀。本地開發沒問題，上生產就是災難。
- **Guardrails 只放在 prompt 裡** —— 告訴模型"不要刪檔案"不是 Guardrails。模型可以被 prompt 注入覆蓋。真正的 Guardrails 在程式碼中執行，不在文本中。
- **權限過於嚴格** —— 什麼都幹不了的 Agent 不會有人用。在安全和實用之間找平衡。
- **不記錄被拒絕的操作** —— 瞭解 Agent *試圖*做但被阻止的事情，對除錯和改進 prompt 至關重要。

## 延伸閱讀

- [Simon Willison: Prompt Injection](https://simonwillison.net/series/prompt-injection/) —— 關於威脅模型的全面系列
- [Anthropic: Mitigating Prompt Injection](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) —— 實用防禦模式
