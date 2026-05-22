# LSP Capability — 详细设计方案

> 基于当前 pi-craft 架构 · 2026-05-21

---

## 1. 定位与集成点

### 在架构中的位置

```
src/capabilities/lsp/
├── index.ts            # 扩展入口：配置开关 + 注册工具
├── server-pool.ts      # Language server 进程池
├── json-rpc.ts         # JSON-RPC 编解码
├── diagnostics.ts      # 诊断结果格式化
└── config.ts           # LSP 配置类型 + 默认值
```

### 与其他模块的关系

```
Core (registry + config)
  │ 读 globalThis._state (SubagentManager 等不需要)
  │ 读 getCraftConfig() → enableLsp, lsp.servers
  │
  ▼
LSP Capability
  │ 注册 lsp 工具
  │ LLM 调用: lsp({ action: "diagnostics", path: "src/auth.ts" })
  │
  ├─► server-pool.ts: 管理语言服务器进程生命周期
  ├─► json-rpc.ts: 发送请求、接收响应和通知
  └─► diagnostics.ts: 解析 publishDiagnostics 并格式化
```

### 对现有代码的改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/core/config.ts` | 加 `LspConfig` 类型 + `enableLsp` 字段 | 已有 `enableLsp`，需加 `lsp` 子配置 |
| `package.json` | 已有 `./src/capabilities/lsp/index.ts` | 无需改 |
| 其他文件 | **零改动** | LSP 完全独立 |

---

## 2. 工作流程

### 2.1 整体时序

```
Implementation 阶段
  │
  │ LLM 用 write 修改 src/auth.ts
  │
  ├─► LLM 调用 lsp({ action: "diagnostics", path: "src/auth.ts" })
  │
  │   LSP Capability:
  │     1. 检查 server 缓存，.ts → pool.get("typescript")
  │     2. 缓存未命中 → spawn("typescript-language-server", ["--stdio"])
  │     3. 发送 initialize request
  │     4. 发送 initialized notification
  │     5. 发送 textDocument/didOpen (文件内容)
  │     6. 发送 textDocument/diagnostic request
  │     7. 等待 textDocument/publishDiagnostics 通知
  │     8. 格式化返回给 LLM
  │
  ├─► 返回:
  │   src/auth.ts  (3 issues)
  │   🔴 L12: Type 'string' is not assignable to 'number'
  │   🟡 L5:  'unusedVar' is declared but never used
  │   🔵 L1:  'fs' is deprecated, use 'node:fs/promises'
  │
  └─► LLM 根据诊断结果修复 → 再次 lsp 验证
```

### 2.2 第二次调用（缓存命中）

```
LLM 调用 lsp({ action: "diagnostics", path: "src/auth.ts" })
  │
  │ 1. server 已在缓存中 → 复用已有进程
  │ 2. 文件内容有变化 → 发送 textDocument/didChange
  │ 3. 发送 textDocument/diagnostic
  │ 4. 等待 publishDiagnostics
  │ 5. 返回
```

---

## 3. 工具设计

### 3.1 工具注册

```typescript
// src/capabilities/lsp/index.ts

import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

const LspParams = Type.Object({
  action: StringEnum(["diagnostics", "hover", "definition", "references"] as const),
  path: Type.String({ description: "File path relative to project root" }),
  line: Type.Optional(Type.Number({ description: "1-based line number (required for hover/definition/references)" })),
  column: Type.Optional(Type.Number({ description: "1-based column number (required for hover)" })),
});

pi.registerTool({
  name: "lsp",
  label: "LSP",
  description: [
    "Query language server for a file. Use after making code changes.",
    "Actions:",
    "  diagnostics — Check for errors, warnings, hints in a file",
    "  hover — Get type info and docs at a position",
    "  definition — Find where a symbol is defined",
    "  references — Find all references to a symbol",
  ].join("\n"),
  parameters: LspParams,
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // ...
  },
});
```

### 3.2 四种 Action 详解

#### diagnostics

```
输入: { action: "diagnostics", path: "src/auth.ts" }
输出:
  src/auth.ts  (3 issues)
  🔴 Error  L12:5  Type 'string' is not assignable to type 'number'. ts(2322)
  🟡 Warn   L5:10  'unusedVar' is declared but its value is never read. ts(6133)
  🔵 Hint   L1:1   'fs' is deprecated. Use 'node:fs/promises' instead. ts(6385)
  (No issues) 或 (File not in workspace) 等
```

#### hover

```
输入: { action: "hover", path: "src/auth.ts", line: 42, column: 10 }
输出:
  Line 42, Col 10
  ```typescript
  (method) UserService.authenticate(token: string): Promise<User | null>
  ```
  Authenticates a user by JWT token. Returns null if token is invalid.
```

#### definition

```
输入: { action: "definition", path: "src/auth.ts", line: 42, column: 10 }
输出:
  Definition of 'authenticate':
  src/services/user.ts:128:14

  (如果需要，可以跟随返回定义处的代码片段)
```

#### references

```
输入: { action: "references", path: "src/services/user.ts", line: 128, column: 14 }
输出:
  3 references to 'authenticate':
  1. src/auth.ts:42:10
  2. src/middleware/auth.ts:15:22
  3. src/routes/login.ts:33:5
```

### 3.3 批量诊断（可选扩展）

LLM 改完多个文件后可以一次检查：

```
LLM 调用:
  lsp({ action: "diagnostics", path: ["src/auth.ts", "src/models/user.ts", "src/utils/jwt.ts"] })

返回:
  src/auth.ts  (3 issues)
  🔴 L42:5 Type 'string' is not assignable...

  src/models/user.ts  (0 issues)

  src/utils/jwt.ts  (1 issue)
  🟡 L10:15 Unused import 'crypto'
```

---

## 4. Server 进程池

### 4.1 架构

```typescript
// src/capabilities/lsp/server-pool.ts

interface LspServer {
  process: ChildProcess;
  extensions: Set<string>;    // 此 server 支持的文件扩展名
  capabilities: ServerCapabilities; // 来自 initialize 响应
  openFiles: Set<string>;      // 已发送 didOpen 的文件
  pendingRequests: Map<number, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>;
  nextId: number;
  buffer: string;              // stdout 行缓冲
  state: "starting" | "ready" | "error" | "closing";
}

class LspServerPool {
  private servers = new Map<string, LspServer>();

  async getServer(filePath: string): Promise<LspServer> { ... }
  async sendRequest<T>(server: LspServer, method: string, params: unknown): Promise<T> { ... }
  onNotification(server: LspServer, method: string, handler: (params: any) => void): void { ... }
  shutdown(): void { ... }
}
```

### 4.2 Server 发现与匹配

```typescript
// 文件扩展名 → language server 标识
const EXTENSION_MAP: Record<string, string> = {
  ".ts":   "typescript",
  ".tsx":  "typescript",
  ".js":   "typescript",
  ".jsx":  "typescript",
  ".go":   "go",
  ".rs":   "rust",
  ".py":   "python",
  ".pyi":  "python",
};

// 用户配置覆盖
// craft.lsp.servers: { "typescript": "typescript-language-server --stdio" }

const DEFAULT_SERVERS: Record<string, string> = {
  "typescript": "typescript-language-server --stdio",
  "go":         "gopls",
  "rust":       "rust-analyzer",
  "python":     "pyright-langserver --stdio",
};
```

### 4.3 Server 生命周期

```
                    spawn()
                       │
                       ▼
                  ┌─ starting ──┐
                  │  send initialize │
                  │  wait for response│
                  └──────┬──────┘
                         │ 成功
                         ▼
                    ┌─ ready ──┐
                    │  处理请求  │
                    │  接收通知  │──── 崩溃 ──► 重启一次 ──► error
                    └──────┬──┘
                           │ shutdown()
                           ▼
                       closing → kill
```

```typescript
async getServer(extension: string, cwd: string): Promise<LspServer> {
  const serverType = EXTENSION_MAP[extension];
  if (!serverType) throw new Error(`No language server configured for ${extension}`);

  let server = this.servers.get(serverType);
  if (server) return server;

  // 获取命令
  const userConfig = getCraftConfig()?.lsp?.servers?.[serverType];
  const defaultCmd = DEFAULT_SERVERS[serverType];
  const cmdStr = userConfig || defaultCmd;
  if (!cmdStr) throw new Error(`No server command for ${serverType}`);

  // 构造新 server
  server = this.createServer(serverType, cmdStr, cwd);
  this.servers.set(serverType, server);

  // 初始化
  await this.initialize(server, cwd);

  return server;
}

private async initialize(server: LspServer, cwd: string): Promise<void> {
  const result = await this.sendRequest(server, "initialize", {
    processId: process.pid,
    rootUri: `file://${cwd}`,
    capabilities: {
      textDocument: {
        diagnostic: { dynamicRegistration: true },
        hover: { dynamicRegistration: true },
        definition: { dynamicRegistration: true },
        references: { dynamicRegistration: true },
      },
    },
    workspaceFolders: [{ uri: `file://${cwd}`, name: path.basename(cwd) }],
  });

  server.capabilities = result.capabilities;
  this.sendNotification(server, "initialized", {});
  server.state = "ready";
}
```

### 4.4 崩溃恢复

```typescript
// 监听进程退出
server.process.on("exit", (code) => {
  if (server.state === "closing") return;

  // 尝试重启一次
  this.servers.delete(serverType);
  try {
    const newServer = this.createServer(serverType, cmdStr, cwd);
    await this.initialize(newServer, cwd);
    this.servers.set(serverType, newServer);
    // 重新打开之前 open 的文件
    for (const file of server.openFiles) {
      const content = fs.readFileSync(path.join(cwd, file), "utf-8");
      this.sendNotification(newServer, "textDocument/didOpen", {
        textDocument: { uri: toUri(file), languageId, version: 1, text: content },
      });
    }
  } catch {
    // 重启失败，标记为 error
    server.state = "error";
  }
});
```

---

## 5. JSON-RPC 通信

### 5.1 协议

```
Request (pi → server):
  Content-Length: {n}\r\n
  \r\n
  {"jsonrpc":"2.0","id":1,"method":"textDocument/diagnostic","params":{...}}

Response (server → pi):
  Content-Length: {n}\r\n
  \r\n
  {"jsonrpc":"2.0","id":1,"result":{...}}

Notification (server → pi):
  Content-Length: {n}\r\n
  \r\n
  {"jsonrpc":"2.0","method":"textDocument/publishDiagnostics","params":{...}}
```

### 5.2 编解码

```typescript
// src/capabilities/lsp/json-rpc.ts

type JsonRpcMessage = 
  | { jsonrpc: "2.0"; id: number; method: string; params?: unknown }
  | { jsonrpc: "2.0"; id: number; result: unknown } | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } }
  | { jsonrpc: "2.0"; method: string; params?: unknown };

function parseMessages(buffer: string): { messages: JsonRpcMessage[]; remaining: string } {
  const messages: JsonRpcMessage[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    // 读 Header
    const headerEnd = buffer.indexOf("\r\n\r\n", offset);
    if (headerEnd === -1) break;

    const header = buffer.slice(offset, headerEnd);
    const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
    if (!contentLengthMatch) break;

    const contentLength = parseInt(contentLengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (bodyEnd > buffer.length) break;

    const body = buffer.slice(bodyStart, bodyEnd);
    messages.push(JSON.parse(body));
    offset = bodyEnd;
  }

  return { messages, remaining: buffer.slice(offset) };
}

function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}
```

### 5.3 请求-响应匹配

```typescript
async sendRequest<T>(server: LspServer, method: string, params: unknown): Promise<T> {
  const id = server.nextId++;
  const msg = encodeMessage({ jsonrpc: "2.0", id, method, params });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.pendingRequests.delete(id);
      reject(new Error(`LSP request timeout: ${method}`));
    }, 10000); // 10 秒超时

    server.pendingRequests.set(id, { resolve, reject, timer });
    server.process.stdin!.write(msg);
  });
}
```

---

## 6. 文件同步

### 6.1 策略：On-Demand DidOpen

```typescript
async ensureFileOpen(server: LspServer, filePath: string, cwd: string): Promise<void> {
  const uri = `file://${path.join(cwd, filePath)}`;

  if (server.openFiles.has(uri)) {
    // 文件已 open，检测内容是否变化
    // 简化方案：每次调用都发 didChange
  }

  const fullPath = path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const extension = path.extname(filePath);
  const languageId = EXTENSION_TO_LANGUAGE[extension] || extension.slice(1);

  // 首次 open
  if (!server.openFiles.has(uri)) {
    this.sendNotification(server, "textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
    server.openFiles.add(uri);
  } else {
    // 内容变化 → didChange
    this.sendNotification(server, "textDocument/didChange", {
      textDocument: { uri, version: (server.fileVersions.get(uri) || 1) + 1 },
      contentChanges: [{ text: content }],
    });
  }
}
```

### 6.2 工作区根目录

LSP server 需要知道项目根目录来决定 tsconfig.json / go.mod 等的位置：

```typescript
// 使用 Pi session 的 cwd（通过工具 ctx.cwd）
const rootUri = `file://${ctx.cwd}`;
```

### 6.3 不要同步 node_modules 等

LSP server 自己会通过 `.gitignore` / `tsconfig.json` 的 `exclude` 来处理，不需要我们额外过滤。但如果用户配了 `lsp.exclude`，可以用 `workspace/didChangeConfiguration` 通知 server。

---

## 7. 错误处理矩阵

| 错误场景 | 检测方式 | 返回给 LLM |
|---------|---------|-----------|
| Server 命令未安装 | `spawn` 抛出 ENOENT | `⚠️ typescript-language-server not found. Install: npm i -g typescript-language-server typescript` |
| Server 启动超时 | initialize 10s 无响应 | `⚠️ Language server startup timed out after 10s` |
| Server 不支持该 action | capabilities 中无此项 | `⚠️ This language server does not support hover` |
| 文件不存在 | `fs.existsSync` | `⚠️ File not found: src/nonexistent.ts` |
| 不支持的扩展名 | EXTENSION_MAP 中无匹配 | `⚠️ No language server configured for .{ext}. Supported: .ts, .tsx, .go, .rs, .py` |
| Server 进程崩溃 | `exit` 事件 | 自动重启一次；仍失败则返回 `⚠️ Language server crashed and could not be restarted` |
| 请求超时 | 10s timer | `⚠️ Language server did not respond in 10s` |
| 工作区无配置文件 | LSP 行为正常但无诊断 | `✓ No issues found (no tsconfig.json detected, server may not analyze)` |

---

## 8. 性能考量

### 8.1 进程复用

```
.ts   ──► typescript-language-server (1 个进程，处理所有 .ts/.tsx/.js 文件)
.go   ──► gopls (1 个进程)
.py   ──► pyright (1 个进程)
```

整个 session 最多 `N` 个 language server 进程，`N` = 项目中用到的语言数。

### 8.2 内存

- typescript-language-server: ~200-500MB（取决于项目大小）
- gopls: ~100-200MB
- pyright: ~100-300MB

单个 session 不会超过 1GB。

### 8.3 启动延迟

- typescript-language-server 首次启动: 2-5 秒（加载 tsconfig、解析项目）
- 后续调用: <500ms

### 8.4 优化

- 同一文件的连续诊断调用合并（500ms debounce）
- 非 diagnostics action 不触发文件同步
- Pi session 关闭时 cleanup（发送 shutdown 请求 + kill 进程）

---

## 9. 配置

### 9.1 config.ts

```typescript
// src/core/config.ts 中的类型定义

export interface LspConfig {
  /** 文件扩展名 → "command args" 映射，覆盖默认值 */
  servers?: Record<string, string>;
  /** Glob patterns to exclude from diagnostics (not sent to server) */
  exclude?: string[];
  /** 单文件最多返回的诊断数 */
  maxDiagnostics?: number;
  /** 请求超时毫秒 */
  timeout?: number;
}
```

### 9.2 用户配置示例

```jsonc
// .pi/settings.json
{
  "craft": {
    "enableLsp": true,
    "lsp": {
      "servers": {
        // 使用项目本地的 typescript
        "typescript": "./node_modules/.bin/typescript-language-server --stdio",
        // 指定 gopls 路径
        "go": "~/go/bin/gopls -remote=auto",
        // 禁用 Python（值为 null 表示不启用）
        "python": null
      },
      "exclude": ["**/generated/**", "**/*.test.ts"],
      "maxDiagnostics": 50,
      "timeout": 15000
    }
  }
}
```

### 9.3 默认值

```typescript
const DEFAULT_LSP_CONFIG: LspConfig = {
  timeout: 10000,
  maxDiagnostics: 100,
  exclude: [],
};
```

---

## 10. LLM 使用指南

### 10.1 告诉 LLM 何时使用

在 implementation 阶段的 system prompt 中添加：

```
## LSP TOOL

You have access to an `lsp` tool for language server checks.
Use it after making code changes to verify correctness.

WHEN TO USE:
- After writing a new file or editing existing code
- When unsure about a type or API signature (use hover)
- When refactoring and need to find all references

HOW TO USE:
  lsp({ action: "diagnostics", path: "src/myfile.ts" })
  → Returns errors/warnings/hints with line numbers

DO NOT call `tsc --noEmit` or `go build` for type checking.
Use the lsp tool instead — it's faster and gives precise locations.
```

### 10.2 典型交互

```
LLM: write src/auth.ts with new middleware...
LLM: lsp({ action: "diagnostics", path: "src/auth.ts" })
  → 🔴 L42: Type 'string' is not assignable to 'number'
LLM: lsp({ action: "hover", path: "src/auth.ts", line: 42, column: 10 })
  → (method) UserService.authenticate(token: string): Promise<User | null>
LLM: Edit src/auth.ts to fix the type error...
LLM: lsp({ action: "diagnostics", path: "src/auth.ts" })
  → ✓ No issues found
```

---

## 11. 实施计划

### Phase 1: 最小可行 (~8h)

```
src/capabilities/lsp/
├── index.ts            # 入口 + 工具注册
└── server-pool.ts      # 进程池 + JSON-RPC
```

- 只实现 `diagnostics` action
- 只支持 TypeScript
- 基础错误处理
- 在 pi-craft 开发过程中 dogfooding

### Phase 2: 完善 (~6h)

```
src/capabilities/lsp/
├── ...
├── json-rpc.ts         # 从 server-pool.ts 抽离
├── diagnostics.ts      # 格式化
└── config.ts           # 配置类型
```

- 加 `hover`、`definition`、`references`
- 加 Go、Python、Rust 支持
- 完善错误处理和崩溃恢复
- TUI 状态指示（状态栏显示 🔍 图标）

### 验证标准

```bash
# 1. 开关测试
craft.enableLsp: false → lsp 工具不注册

# 2. 未安装 server
未装 tsserver → 调用 lsp → "⚠️ typescript-language-server not found..."

# 3. 正常使用
有 ts 项目 → lsp({ action: "diagnostics", path: "src/foo.ts" }) → 返回诊断

# 4. 错误代码
写入类型错误 → lsp diagnostics → 检测到 → 修复 → lsp → 无错误

# 5. 崩溃恢复
kill tsserver → lsp 调用 → 自动重启 → 正常返回

# 6. 多文件
连续检查 10 个文件 → server 复用 → 全部正常返回
```
