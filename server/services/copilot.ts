import { CopilotClient } from "@github/copilot-sdk";
import { getWorkItem, type WorkItem } from "../../utils/azure-devops.js";
import * as fs from "fs";
import * as path from "path";

export interface TicketPlan {
  summary: string;
  implementationPlan: string;
}

/**
 * Gets skill directories if .github/skills exists in the working directory.
 * The SDK doesn't auto-discover skill directories, so we need to specify them.
 */
function getSkillDirectories(workingDirectory: string): string[] {
  const skillsDir = path.join(workingDirectory, ".github", "skills");

  if (fs.existsSync(skillsDir)) {
    console.log(`Found skills directory: ${skillsDir}`);
    return [skillsDir];
  }

  return [];
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
  workingDirectory?: string
): Promise<TicketPlan> {
  console.log("Creating Copilot client...");
  const client = new CopilotClient();

  // Get skill directories if they exist (SDK doesn't auto-discover these)
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  console.log("Creating session...");
  // The SDK automatically discovers instruction files from .github/instructions/
  // when workingDirectory is set - no need to manually load them
  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  console.log("Sending prompt...");
  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer. Analyze this ticket and create an implementation plan.

Ticket Title: ${ticket.title}
Ticket Type: ${ticket.type}
Ticket State: ${ticket.state}
Ticket Description: ${ticket.description}

Please provide:
1. A brief summary of what the ticket is asking for
2. A numbered implementation plan with specific steps`,
  });

  console.log("Got response, cleaning up...");
  await session.destroy();
  await client.stop();

  const response = result?.data?.content || "";
  console.log("Response length:", response.length);

  // Clean up markdown artifacts
  const cleanMarkdown = (text: string) => {
    return text
      .replace(/\*\*[^*]*\*\*:?\s*/gi, "") // Remove **text** patterns
      .replace(/^\d+\.\s*/gm, "") // Remove leading numbers like "1. "
      .replace(/^#+\s*/gm, "") // Remove markdown headers
      .replace(/^\s*[-*]\s*/gm, "• ") // Normalize bullet points
      .trim();
  };

  // Simple split on "Implementation Plan" or similar
  const lowerResponse = response.toLowerCase();
  const planIndex = lowerResponse.indexOf("implementation plan");

  if (planIndex > 0) {
    const rawSummary = response.substring(0, planIndex);
    const rawPlan = response.substring(planIndex);

    return {
      summary: cleanMarkdown(rawSummary),
      implementationPlan: rawPlan
        .replace(/\*\*implementation plan\*\*:?/gi, "")
        .replace(/^implementation plan:?\s*/i, "")
        .trim(),
    };
  }

  return {
    summary: cleanMarkdown(response),
    implementationPlan: "",
  };
}

export async function refinePlan(
  ticket: WorkItem,
  currentPlan: string,
  feedback: string,
  workingDirectory?: string
): Promise<string> {
  console.log("Refining plan with feedback...");
  const client = new CopilotClient();

  // Get skill directories if they exist
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  // The SDK automatically discovers instruction files from .github/instructions/
  // when workingDirectory is set
  const session = await client.createSession({
    model: "gpt-4.1",
    ...(workingDirectory && { workingDirectory }),
    ...(skillDirectories.length > 0 && { skillDirectories }),
  });

  const result = await session.sendAndWait({
    prompt: `You are a senior software engineer. Refine this implementation plan based on the feedback.

Ticket Title: ${ticket.title}
Ticket Description: ${ticket.description}

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
  const client = new CopilotClient();

  // Get skill directories if they exist
  const skillDirectories = workingDirectory
    ? getSkillDirectories(workingDirectory)
    : [];

  if (skillDirectories.length > 0) {
    console.log(`Using skill directories: ${skillDirectories.join(", ")}`);
  }

  // The SDK automatically discovers instruction files from .github/instructions/
  // when workingDirectory is set - no need to manually load them
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
    await session.sendAndWait({
      prompt: `Implement this ticket:

Title: ${ticket.title}
Description: ${ticket.description}

Implementation Plan:
${plan}

Please implement these changes now. Create or modify files as needed.`,
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
