---
name: implement-ticket
description: >-
  Fetches an Azure DevOps ticket and implements it in the current repository.
  Use when the user wants to implement a ticket, work item, or user story.
  Triggers on "implement ticket", "work on ticket", "implement this ticket",
  "implement ticket #123", or when the user provides an Azure DevOps work item
  URL (dev.azure.com/.../workitems/...).
---

# Implement Ticket

Fetch an Azure DevOps ticket, explore the codebase, generate an implementation plan, let the developer refine it, then implement it.

## Workflow

Follow these steps in order. Do not skip steps.

### Step 1: Get Ticket URL

If the user provided a ticket URL or ID in their message, use it. Otherwise ask:

> "What's the Azure DevOps ticket URL? (e.g. `https://dev.azure.com/{org}/{project}/_workitems/edit/123`)"

### Step 2: Fetch Ticket Details

A `fetch_ticket.py` script is bundled in the `scripts/` subdirectory alongside this SKILL.md. Determine the skill directory from the path of this SKILL.md file and run:

```bash
python3 <skill_dir>/scripts/fetch_ticket.py <ticket_url>
```

The script reads `ADO_PAT` from the environment. If the JSON output contains an `error` key, surface the error to the user and stop.

Display the fetched ticket to the user:

```
Ticket #<id>: <title>
Type: <type> | State: <state>
Assigned to: <assignedTo or "Unassigned">
<description (first 300 chars if long)>
<if figmaUrl: "Figma: <figmaUrl>">
```

### Step 3: Explore the Codebase

Silently explore the repo — do not narrate this step. Aim to understand:

1. **Architecture docs**: Read `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md` if present in the root.
2. **Directory structure**: List the root to identify source directories (`src/`, `app/`, `lib/`, etc.).
3. **Relevant files**: Find files related to what the ticket describes — search by keyword, component name, or feature area.
4. **Existing patterns**: Read a few relevant files to understand naming conventions, code style, and patterns to follow.

### Step 4: Generate Implementation Plan

After exploring, present the plan in this format:

```markdown
## Plan for Ticket #<id> — <title>

### Summary
[2–3 sentences describing what the ticket asks for and the approach]

### Files to Change
- `path/to/file.ts` — description of change
- `path/to/other.ts` — description of change

### Steps
1. [Specific step referencing actual file paths and patterns found]
2. ...

### Notes
[Edge cases, decisions, or tradeoffs — omit if none]
```

### Step 5: Refine the Plan

After presenting the plan, ask:

> "Does this plan look good? You can ask me to refine specific aspects or change the approach. Say **proceed** when you're happy with it."

Wait for the user's response:

- **If they request changes**: Update the plan, show the revised version, and ask again.
- **If they say "proceed"** (or equivalent like "looks good", "go ahead", "lgtm"): Move to Step 6.

### Step 6: Implement

Implement the approved plan using Read, Edit, Write, Bash, Glob, and Grep tools:

- Follow the exact steps from the approved plan
- Respect existing code patterns, naming conventions, and style found in Step 3
- Do NOT run `git commit` — leave committing to the developer

When done, summarize:

- Files modified/created (bulleted list with brief description)
- Any deviations from the plan and why
- Suggested next steps (e.g., run tests, review the diff, then commit)

## Notes

- **ADO_PAT missing**: Instruct the user to `export ADO_PAT=<token>` or add it to their shell profile / `.env` file.
- **Figma URLs in tickets**: If `figmaUrl` is present in the ticket, note it in the plan. Fetching Figma designs requires a Figma MCP connection — mention this if the ticket is design-heavy.
- **Scope**: Only implement what the ticket describes. Don't expand scope or refactor unrelated code.
