# Copilot SDK Customization Guide

This document explains how to use custom instruction files, skills, and MCP servers with the GitHub Copilot SDK.

## Table of Contents

- [Custom Instructions](#custom-instructions)
- [Skills](#skills)
- [MCP Servers](#mcp-servers)
- [Custom Agents](#custom-agents)

---

## Custom Instructions

Custom instructions allow you to define behavior rules and context for the Copilot assistant.

### Automatic Discovery (Recommended)

The Copilot CLI **automatically discovers** instruction files when you set `workingDirectory`. Just place your instruction files in `.github/instructions/` and set the working directory:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  workingDirectory: "/path/to/your/repo",  // CLI discovers .github/instructions/ automatically
});
```

The CLI looks for:
- `.github/copilot-instructions.md` - Single instruction file
- `.github/instructions/*.instructions.md` - Multiple instruction files

**No manual file loading required!**

### Instruction File Format

Instruction files use markdown with optional YAML frontmatter:

```markdown
---
applyTo: "**.ts, **.js"
description: "TypeScript coding standards"
name: "TypeScript Instructions"
---

## Rules

- Use strict TypeScript mode
- Prefer interfaces over types
- Always handle errors explicitly
```

### System Message Configuration (Manual Override)

If you need to add additional instructions programmatically (beyond what's in files), use `systemMessage`:

#### Append Mode (Default - Preserves SDK Guardrails)

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  workingDirectory: "/path/to/repo",
  systemMessage: {
    mode: "append",  // preserves SDK safety guardrails + auto-discovered instructions
    content: `
<additional_rules>
- Extra rule added programmatically
</additional_rules>
`,
  },
});
```

#### Replace Mode (Full Control - Removes Guardrails)

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  systemMessage: {
    mode: "replace",
    content: "You are a helpful assistant that only writes Python code.",
  },
});
```

**Note:** Replace mode bypasses all auto-discovery and SDK defaults

---

## Skills

Skills are reusable capabilities that can be loaded from directories.

### Configuration

Use `skillDirectories` and `disabledSkills` in `SessionConfig`:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  skillDirectories: [
    "/path/to/skills",
    "./.github/skills",
    "./my-custom-skills",
  ],
  disabledSkills: ["skill-to-disable"],
});
```

### Skill Directory Structure

Skills are loaded from specified directories. Each skill typically has its own folder with configuration files.

```
.github/
└── skills/
    ├── code-review/
    │   └── skill.json
    ├── testing/
    │   └── skill.json
    └── documentation/
        └── skill.json
```

---

## MCP Servers

Model Context Protocol (MCP) servers extend Copilot's capabilities with external tools and data sources.

### Local/Stdio MCP Server

For servers running as local processes:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  mcpServers: {
    "my-local-server": {
      type: "local",  // or "stdio"
      command: "node",
      args: ["./mcp-server.js"],
      tools: ["*"],   // "*" = all tools, or specify names: ["tool1", "tool2"]
      env: {
        MY_VAR: "value",
        API_KEY: process.env.API_KEY,
      },
      cwd: "/working/directory",
      timeout: 30000,  // 30 seconds
    },
  },
});
```

### Remote MCP Server (HTTP/SSE)

For servers running as HTTP services:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  mcpServers: {
    "my-remote-server": {
      type: "http",  // or "sse" for Server-Sent Events
      url: "https://my-mcp-server.example.com",
      tools: ["tool1", "tool2"],  // [] = none, "*" = all
      headers: {
        "Authorization": `Bearer ${process.env.API_TOKEN}`,
        "X-Custom-Header": "value",
      },
      timeout: 60000,  // 60 seconds
    },
  },
});
```

### MCP Server Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | `"local"` \| `"stdio"` \| `"http"` \| `"sse"` | Server type |
| `tools` | `string[]` | Tools to include (`["*"]` for all, `[]` for none) |
| `timeout` | `number` | Request timeout in milliseconds |
| `command` | `string` | (local only) Command to run |
| `args` | `string[]` | (local only) Command arguments |
| `env` | `Record<string, string>` | (local only) Environment variables |
| `cwd` | `string` | (local only) Working directory |
| `url` | `string` | (remote only) Server URL |
| `headers` | `Record<string, string>` | (remote only) HTTP headers |

---

## Custom Agents

Define specialized agents with their own prompts and tool access:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  customAgents: [
    {
      name: "code-reviewer",
      displayName: "Code Reviewer",
      description: "Reviews code for quality and security issues",
      prompt: `You are an expert code reviewer. Focus on:
- Security vulnerabilities
- Performance issues
- Code readability
- Best practices`,
      tools: ["read", "grep", "glob"],  // null = all tools
      mcpServers: {
        "lint-server": {
          type: "local",
          command: "npx",
          args: ["eslint-mcp-server"],
          tools: ["*"],
        },
      },
      infer: true,  // available for model inference
    },
    {
      name: "test-writer",
      displayName: "Test Writer",
      description: "Writes comprehensive tests",
      prompt: "You are a test engineer. Write thorough unit and integration tests.",
      tools: null,  // all tools available
      infer: true,
    },
  ],
});
```

### Custom Agent Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Unique identifier for the agent |
| `displayName` | `string` | Human-readable name |
| `description` | `string` | What the agent does |
| `prompt` | `string` | System prompt for the agent |
| `tools` | `string[] \| null` | Tools the agent can use (`null` = all) |
| `mcpServers` | `Record<string, MCPServerConfig>` | Agent-specific MCP servers |
| `infer` | `boolean` | Whether available for model inference (default: `true`) |

---

## How Auto-Discovery Works

The Copilot CLI automatically discovers and applies configuration from standard locations when `workingDirectory` is set.

### What's Auto-Discovered

| Location | Auto-Discovered | Notes |
|----------|-----------------|-------|
| `.github/copilot-instructions.md` | ✅ Yes | Single instruction file |
| `.github/instructions/*.instructions.md` | ✅ Yes | Multiple instruction files |
| `.github/skills/` | ❌ No | Must specify via `skillDirectories` |
| MCP servers | ❌ No | Must specify via `mcpServers` |

### Setting Working Directory

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  workingDirectory: "/path/to/your/repo",
});
```

This single setting enables:
- Instruction file discovery
- Relative path resolution for tools
- Context awareness of the codebase

### Creating Instruction Files

Create instruction files in `.github/instructions/` with the `.instructions.md` extension:

```markdown
---
applyTo: "**.ts, **.tsx"
description: "React component guidelines"
name: "React Instructions"
---

## Component Rules

- Use functional components with hooks
- Always define prop types with interfaces
- Use meaningful component names
- Extract reusable logic into custom hooks

## Styling

- Use CSS modules or styled-components
- Follow BEM naming convention for class names
- Keep styles co-located with components
```

### Testing Instructions

To verify instructions are being applied, create an instruction file with easily observable behavior:

```markdown
---
applyTo: "**"
description: "Test instructions"
name: "Test Behavior"
---

## Test Rules

- Always start responses with "QUACK QUACK!"
- End every code block with a comment "// This code is absolutely magnificent!"
- Use variable names that include the word "duck" when possible
```

If the assistant follows these rules, you know the instructions are being loaded correctly.

---

## Type Reference

### SessionConfig (excerpt)

```typescript
interface SessionConfig {
  sessionId?: string;
  model?: string;
  systemMessage?: SystemMessageConfig;
  tools?: Tool[];
  mcpServers?: Record<string, MCPServerConfig>;
  customAgents?: CustomAgentConfig[];
  skillDirectories?: string[];
  disabledSkills?: string[];
  workingDirectory?: string;
  streaming?: boolean;
  // ... other options
}
```

### MCPLocalServerConfig

```typescript
interface MCPLocalServerConfig {
  type?: "local" | "stdio";
  command: string;
  args: string[];
  tools: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}
```

### MCPRemoteServerConfig

```typescript
interface MCPRemoteServerConfig {
  type: "http" | "sse";
  url: string;
  tools: string[];
  headers?: Record<string, string>;
  timeout?: number;
}
```

### CustomAgentConfig

```typescript
interface CustomAgentConfig {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[] | null;
  prompt: string;
  mcpServers?: Record<string, MCPServerConfig>;
  infer?: boolean;
}
```
