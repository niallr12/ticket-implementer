# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript project demonstrating the GitHub Copilot SDK (`@github/copilot-sdk`). It implements an interactive CLI weather assistant that uses custom tools to provide weather information.

## Commands

**Run the application:**
```bash
npx tsx index.ts
```

**Install dependencies:**
```bash
npm install
```

## Architecture

The project consists of a single entry point (`index.ts`) that:

1. **Defines custom tools** using `defineTool()` - Tools expose functions the LLM can call back into your process (e.g., `get_weather`)
2. **Creates a CopilotClient** - Manages connection to GitHub Copilot CLI via JSON-RPC
3. **Creates a session** with streaming enabled - Sessions are independent conversations with a specified model
4. **Handles streaming responses** via `session.on("assistant.message_delta", ...)` event handlers
5. **Implements a REPL loop** using Node's readline for user interaction

## Key SDK Patterns

- **Tool definitions** use JSON Schema for parameters and async handlers that return JSON-serializable values
- **Streaming** is enabled via `streaming: true` in session config; delta events provide incremental text
- **Session events**: `assistant.message_delta` (streaming chunks), `assistant.message` (final), `session.idle` (completion)
- **Cleanup**: Call `client.stop()` and `session.destroy()` to properly release resources
