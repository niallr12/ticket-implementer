import { CopilotClient } from "@github/copilot-sdk";
import type { PRInfo } from "../../utils/azure-devops-pr.js";

export interface ReviewProgress {
  type: "message" | "tool_start" | "tool_end" | "complete" | "error";
  content: string;
}

export interface ReviewCategory {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export interface DiscussionMessage {
  role: "user" | "assistant";
  content: string;
}

export const DEFAULT_REVIEW_CATEGORIES: ReviewCategory[] = [
  {
    id: "code-quality",
    name: "Code Quality",
    description: "Readability, naming, DRY, complexity",
    defaultEnabled: true,
  },
  {
    id: "security",
    name: "Security",
    description: "Injection, XSS, auth issues, secrets, input validation",
    defaultEnabled: true,
  },
  {
    id: "performance",
    name: "Performance",
    description: "N+1 queries, allocations, algorithms, caching",
    defaultEnabled: true,
  },
  {
    id: "error-handling",
    name: "Error Handling",
    description: "Missing error handling, swallowed exceptions",
    defaultEnabled: true,
  },
  {
    id: "testing",
    name: "Testing",
    description: "Missing tests, coverage gaps, edge cases",
    defaultEnabled: true,
  },
  {
    id: "architecture",
    name: "Architecture",
    description: "SOLID principles, separation of concerns",
    defaultEnabled: false,
  },
  {
    id: "documentation",
    name: "Documentation",
    description: "Missing/outdated comments, API docs",
    defaultEnabled: false,
  },
];

/**
 * Perform an AI-powered code review using the Copilot SDK.
 * Streams progress back via the onProgress callback.
 */
export async function performReview(
  pr: PRInfo,
  diff: string,
  activeCategories: string[],
  customFocusAreas: string[],
  onProgress: (progress: ReviewProgress) => void,
  workingDirectory?: string,
  model: string = "claude-sonnet-4.5"
): Promise<void> {
  const clientOptions = workingDirectory ? { cwd: workingDirectory } : {};
  const client = new CopilotClient(clientOptions);

  const session = await client.createSession({
    model,
    streaming: true,
    ...(workingDirectory && { workingDirectory }),
  });

  session.on("assistant.message_delta", (event) => {
    onProgress({ type: "message", content: event.data.deltaContent });
  });

  session.on("tool.execution_start", (event) => {
    onProgress({
      type: "tool_start",
      content: `Exploring: ${event.data.toolName}`,
    });
  });

  session.on("tool.execution_complete", (event) => {
    onProgress({
      type: "tool_end",
      content: `Completed: ${event.data.result?.content}`,
    });
  });

  // Build category instructions
  const categoryNames = activeCategories
    .map((id) => {
      const cat = DEFAULT_REVIEW_CATEGORIES.find((c) => c.id === id);
      return cat ? `- **${cat.name}**: ${cat.description}` : null;
    })
    .filter(Boolean)
    .join("\n");

  // Build custom focus area instructions
  const customFocusSection =
    customFocusAreas.length > 0
      ? `\n\n## Custom Focus Areas\nThe reviewer has asked you to pay special attention to:\n${customFocusAreas.map((area) => `- ${area}`).join("\n")}`
      : "";

  // Truncate diff if extremely large
  const truncatedDiff =
    diff.length > 50000
      ? diff.substring(0, 50000) +
        "\n... (diff truncated - review may be partial)"
      : diff;

  const codebaseExplorationPrompt = workingDirectory
    ? `
IMPORTANT: Before reviewing the code changes, you MUST explore the codebase to understand its structure. Do the following SILENTLY (do not narrate your exploration):

1. Check for documentation files (README.md, CLAUDE.md, AGENTS.md, CONTRIBUTING.md)
2. Explore the directory structure to understand the project layout
3. Look at existing code patterns related to the changed files
4. Only AFTER exploring, output your review in the format below.

`
    : "";

  try {
    const result = await session.sendAndWait(
      {
        prompt: `You are a senior software engineer performing a thorough code review.

${codebaseExplorationPrompt}## Pull Request Details
- **Title**: ${pr.title}
- **Author**: ${pr.author}
- **Source Branch**: ${pr.sourceBranch} → **Target Branch**: ${pr.targetBranch}
- **Description**: ${pr.description || "(No description provided)"}

## Review Categories
Review the changes against these categories:
${categoryNames}
${customFocusSection}

## Code Changes (Diff)
\`\`\`diff
${truncatedDiff}
\`\`\`

## Instructions
1. ${workingDirectory ? "First explore the codebase to understand the architecture and patterns." : "Analyze the diff carefully."}
2. Review the changes against EACH active category above.
3. For each finding, include the file path, approximate line number, severity, and a clear description with a suggestion for improvement.

## Output Format
Output your review in this exact format:

# Code Review: ${pr.title}

## Summary
[2-3 sentence overview of the changes and overall assessment]

[For each category that has findings, create a section:]

## [Category Name]

### [Severity: Critical/High/Medium/Low] - [Short title]
**File**: \`path/to/file\` (line ~N)
**Issue**: [Description of the issue]

\`\`\`diff
- problematic code line(s) from the diff
+ suggested fix (if applicable)
\`\`\`

**Suggestion**: [How to fix it]

---

## Overall Verdict
[APPROVE / REQUEST CHANGES / NEEDS DISCUSSION] - [Brief rationale]

IMPORTANT:
- Do NOT narrate your exploration process
- Only output the final review in the format above
- Be constructive and specific
- If no issues found in a category, skip that category section
- Prioritize actionable feedback
- For EACH finding, include a code snippet showing the problematic line(s) from the diff. Use diff format with \`-\` for problematic lines and \`+\` for suggested fixes where appropriate. This is critical for making the review actionable.`,
      },
      600000 // 10 minute timeout
    );

    // Send the clean, complete review text from the SDK response
    const finalText = result?.data?.content || "";
    onProgress({ type: "complete", content: finalText });
  } catch (error) {
    onProgress({
      type: "error",
      content: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await session.destroy();
    await client.stop();
  }
}

/**
 * Discuss review findings with follow-up questions.
 */
export async function discussReview(
  pr: PRInfo,
  diff: string,
  question: string,
  conversationHistory: DiscussionMessage[],
  workingDirectory?: string
): Promise<string> {
  const client = new CopilotClient({
    ...(workingDirectory && { cwd: workingDirectory }),
  });

  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
  });

  const historyContext =
    conversationHistory.length > 0
      ? `\n\nPrevious discussion:\n${conversationHistory
          .map(
            (m) =>
              `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
          )
          .join("\n\n")}`
      : "";

  const truncatedDiff =
    diff.length > 10000
      ? diff.substring(0, 10000) + "\n... (diff truncated for brevity)"
      : diff;

  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer discussing a code review. Answer questions about the review findings, explain issues in more detail, and help the user understand the changes.

## Pull Request
- **Title**: ${pr.title}
- **Author**: ${pr.author}
- **Description**: ${pr.description || "(No description)"}

## Code Changes (Diff)
\`\`\`diff
${truncatedDiff}
\`\`\`
${historyContext}

User's question: ${question}

Provide a helpful, concise response focused on the code review context.`,
  });

  await session.destroy();
  await client.stop();

  return (
    result?.data?.content || "I couldn't generate a response. Please try again."
  );
}
