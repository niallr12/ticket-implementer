import { CopilotClient } from "@github/copilot-sdk";
import { getWorkItem, type WorkItem } from "../../utils/azure-devops.js";

export interface TicketPlan {
  summary: string;
  implementationPlan: string;
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

export async function generatePlan(ticket: WorkItem): Promise<TicketPlan> {
  console.log("Creating Copilot client...");
  const client = new CopilotClient();

  console.log("Creating session...");
  const session = await client.createSession({
    model: "gpt-4.1",
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
  feedback: string
): Promise<string> {
  console.log("Refining plan with feedback...");
  const client = new CopilotClient();

  const session = await client.createSession({
    model: "gpt-4.1",
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

  const session = await client.createSession({
    model,
    content: `You are a senior software engineer implementing features based on tickets.
Implement the requested changes directly in the codebase.
Follow the provided implementation plan step by step.`,
    streaming: true,
    workingDirectory,
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
