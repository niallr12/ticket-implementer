import { CopilotClient } from "@github/copilot-sdk";
import { getWorkItem, type WorkItem } from "../../utils/azure-devops.js";
import * as fs from "fs";
import * as path from "path";

export interface TicketPlan {
  summary: string;
  implementationPlan: string;
}

function getSkillDirectories(workingDirectory: string): string[] {
  const skillsDir = path.join(workingDirectory, ".github", "skills");
  return fs.existsSync(skillsDir) ? [skillsDir] : [];
}

export interface ImplementationProgress {
  type: "message" | "tool_start" | "tool_end" | "complete" | "error";
  content: string;
}

function parseAzureDevOpsUrl(url: string) {
  const match = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/
  );
  if (!match) {
    throw new Error(`Invalid Azure DevOps URL: ${url}`);
  }
  return {
    organization: match[1],
    project: decodeURIComponent(match[2]),
    workItemId: parseInt(match[3], 10),
  };
}

export async function fetchTicket(url: string): Promise<WorkItem> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const { organization, project, workItemId } = parseAzureDevOpsUrl(url);
  return getWorkItem({ organization, project, pat }, workItemId);
}

export async function generatePlan(
  ticket: WorkItem,
  workingDirectory?: string,
  onProgress?: (message: string) => void,
  model: string = "gpt-4.1"
): Promise<TicketPlan> {
  const clientOptions = workingDirectory ? { cwd: workingDirectory } : {};
  const client = new CopilotClient(clientOptions);
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  const session = await client.createSession({
    model,
    streaming: true, // Enable streaming for tool use
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  // Track progress for UI feedback
  let fullResponse = "";

  session.on("assistant.message_delta", (event) => {
    fullResponse += event.data.deltaContent;
  });

  session.on("tool.execution_start", (event) => {
    onProgress?.(`Exploring: ${event.data.toolName}`);
  });

  const figmaContext = ticket.figmaUrl
    ? `\nFigma Design: ${ticket.figmaUrl}\n\nIMPORTANT: This ticket includes a Figma design. Use the Figma MCP tools to fetch and analyze the design. The implementation should match the design specifications including layout, colors, typography, and component structure.`
    : "";

  const codebaseExplorationPrompt = workingDirectory
    ? `
IMPORTANT: Before creating the implementation plan, you MUST explore the codebase to understand its structure. Do the following SILENTLY (do not narrate your exploration):

1. First, check for documentation files that explain the codebase:
   - Look for AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md in the root directory
   - These files often contain important context about architecture, conventions, and guidelines

2. Explore the directory structure to understand the project layout:
   - List the root directory to see the main folders and files
   - Identify the main source directories (src/, lib/, app/, etc.)

3. Look at existing code patterns:
   - Find files related to what the ticket is asking for
   - Understand existing patterns, naming conventions, and code style

4. Only AFTER exploring the codebase, output your response in the EXACT format specified below.

`
    : "";

  await session.sendAndWait({
    prompt: `You are a senior software engineer. Your task is to analyze a ticket and create a detailed implementation plan.

${codebaseExplorationPrompt}Ticket Title: ${ticket.title}
Ticket Type: ${ticket.type}
Ticket State: ${ticket.state}
Ticket Description: ${ticket.description}${figmaContext}

IMPORTANT OUTPUT FORMAT:
- Do NOT narrate your exploration process
- Do NOT say things like "I'll explore..." or "Let me check..."
- ONLY output the final result in this exact format:

## Summary
[2-3 sentences describing what the ticket is asking for]

## Implementation Plan
[Numbered list of specific implementation steps]

Your plan should be specific to THIS codebase, referencing actual file paths, existing patterns, and conventions you discovered during exploration.${ticket.figmaUrl ? " Include specific design details from the Figma file." : ""}`,
  }, 300000); // 5 minute timeout for exploration

  await session.destroy();
  await client.stop();

  const response = fullResponse;

  // Try to parse structured format with ## headers
  const summaryMatch = response.match(/##\s*Summary\s*\n([\s\S]*?)(?=##\s*Implementation Plan|$)/i);
  const planMatch = response.match(/##\s*Implementation Plan\s*\n([\s\S]*?)$/i);

  if (summaryMatch && planMatch) {
    return {
      summary: summaryMatch[1].trim(),
      implementationPlan: planMatch[1].trim(),
    };
  }

  // Fallback: Clean up markdown artifacts
  const cleanMarkdown = (text: string) => {
    return text
      .replace(/\*\*[^*]*\*\*:?\s*/gi, "") // Remove **text** patterns
      .replace(/^\d+\.\s*/gm, "") // Remove leading numbers like "1. "
      .replace(/^#+\s*/gm, "") // Remove markdown headers
      .replace(/^\s*[-*]\s*/gm, "• ") // Normalize bullet points
      .trim();
  };

  // Fallback: Simple split on "Implementation Plan" or similar
  const lowerResponse = response.toLowerCase();
  const planIndex = lowerResponse.indexOf("implementation plan");

  if (planIndex > 0) {
    const rawSummary = response.substring(0, planIndex);
    const rawPlan = response.substring(planIndex);

    return {
      summary: cleanMarkdown(rawSummary),
      implementationPlan: rawPlan
        .replace(/\*\*implementation plan\*\*:?/gi, "")
        .replace(/^#+\s*implementation plan:?\s*/i, "")
        .trim(),
    };
  }

  return {
    summary: cleanMarkdown(response),
    implementationPlan: "",
  };
}

export interface DiscussionMessage {
  role: "user" | "assistant";
  content: string;
}

export async function discussImplementation(
  ticket: WorkItem,
  plan: string,
  diff: string,
  question: string,
  conversationHistory: DiscussionMessage[],
  workingDirectory?: string
): Promise<string> {
  const client = new CopilotClient({
    ...(workingDirectory && { cwd: workingDirectory }),
  });
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  // Build conversation context
  const historyContext = conversationHistory.length > 0
    ? `\n\nPrevious discussion:\n${conversationHistory.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}`
    : "";

  const figmaContext = ticket.figmaUrl
    ? `\nFigma Design: ${ticket.figmaUrl}`
    : "";

  // Truncate diff if too long
  const truncatedDiff = diff.length > 10000
    ? diff.substring(0, 10000) + "\n... (diff truncated for brevity)"
    : diff;

  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer helping to discuss code changes that were just implemented. Answer questions about the implementation, explain code decisions, and help the user understand the changes. Be conversational and helpful.

Ticket Title: ${ticket.title}
Ticket Description: ${ticket.description}${figmaContext}

Implementation Plan that was followed:
${plan}

Code Changes (Git Diff):
\`\`\`diff
${truncatedDiff}
\`\`\`
${historyContext}

User's question: ${question}

Provide a helpful response about the implementation. Explain code decisions, patterns used, or any aspects of the changes. If the user suggests improvements, acknowledge them and explain how they could be applied, but note that actual changes would need to be made through the "Request Changes" feature. Keep your response concise and focused.`,
  });

  await session.destroy();
  await client.stop();

  return result?.data?.content || "I couldn't generate a response. Please try again.";
}

export async function discussPlan(
  ticket: WorkItem,
  currentPlan: string,
  question: string,
  conversationHistory: DiscussionMessage[],
  workingDirectory?: string
): Promise<string> {
  const client = new CopilotClient({
    ...(workingDirectory && { cwd: workingDirectory }),
  });
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  // Build conversation context
  const historyContext = conversationHistory.length > 0
    ? `\n\nPrevious discussion:\n${conversationHistory.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}`
    : "";

  const figmaContext = ticket.figmaUrl
    ? `\nFigma Design: ${ticket.figmaUrl}`
    : "";

  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer helping to discuss an implementation plan. Answer questions, explain decisions, and provide context about the plan. Be conversational and helpful.

Ticket Title: ${ticket.title}
Ticket Description: ${ticket.description}${figmaContext}

Current Implementation Plan:
${currentPlan}
${historyContext}

User's question: ${question}

Provide a helpful response. If the user's question suggests the plan should be changed, you can mention that, but don't modify the plan directly - just discuss it. Keep your response concise and focused.`,
  });

  await session.destroy();
  await client.stop();

  return result?.data?.content || "I couldn't generate a response. Please try again.";
}

export async function refinePlan(
  ticket: WorkItem,
  currentPlan: string,
  feedback: string,
  workingDirectory?: string
): Promise<string> {
  const client = new CopilotClient({
    ...(workingDirectory && { cwd: workingDirectory }),
  });
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  const figmaRefineContext = ticket.figmaUrl
    ? `\nFigma Design: ${ticket.figmaUrl}`
    : "";

  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer. Refine this implementation plan based on the feedback.

Ticket Title: ${ticket.title}
Ticket Description: ${ticket.description}${figmaRefineContext}

Current Implementation Plan:
${currentPlan}

User Feedback:
${feedback}

Please provide an updated implementation plan that incorporates this feedback. Only output the refined plan, no other text.`,
  });

  await session.destroy();
  await client.stop();

  return result?.data?.content || currentPlan;
}

export async function implementTicket(
  ticket: WorkItem,
  plan: string,
  onProgress: (progress: ImplementationProgress) => void,
  workingDirectory?: string,
  model: string = "claude-sonnet-4.5"
): Promise<void> {
  const clientOptions = workingDirectory ? { cwd: workingDirectory } : {};
  const client = new CopilotClient(clientOptions);
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  const session = await client.createSession({
    model,
    streaming: true,
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  session.on("assistant.message_delta", (event) => {
    onProgress({ type: "message", content: event.data.deltaContent });
  });

  session.on("tool.execution_start", (event) => {
    onProgress({
      type: "tool_start",
      content: `Executing: ${event.data.toolName}`,
    });
  });

  session.on("tool.execution_end", (event) => {
    onProgress({
      type: "tool_end",
      content: `Completed: ${event.data.toolName}`,
    });
  });

  try {
    // Use 10 minute timeout for complex implementations
    const figmaImplementContext = ticket.figmaUrl
      ? `\nFigma Design: ${ticket.figmaUrl}\n\nIMPORTANT: Use the Figma MCP tools to fetch design details. Match the design exactly - colors, spacing, typography, and layout. Extract design tokens and component specifications from the Figma file.`
      : "";

    await session.sendAndWait({
      prompt: `Implement this ticket:

Title: ${ticket.title}
Description: ${ticket.description}${figmaImplementContext}

Implementation Plan:
${plan}

Please implement these changes now. Create or modify files as needed.

IMPORTANT: Do NOT commit any changes. Do NOT run git commit. The user will review and commit the changes manually after reviewing the diff.`,
    }, 600000);
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
