import { CopilotClient, defineTool } from "@github/copilot-sdk";
import * as readline from "readline";
import { getWorkItem } from "./utils/azure-devops.js";

function parseAzureDevOpsUrl(url: string) {
  // Format: https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
  const match = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/,
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

const getWeather = defineTool("get_weather", {
  description: "Get the current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "The city name" },
    },
    required: ["city"],
  },
  handler: async ({ city }) => {
    const conditions = ["sunny", "cloudy", "rainy", "partly cloudy"];
    const temp = Math.floor(Math.random() * 30) + 50;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return { city, temperature: `${temp}°F`, condition };
  },
});

const getTicket = defineTool("get_ticket", {
  description:
    "Fetch details of an Azure DevOps work item/ticket from its URL. Returns the title, description, state, and other metadata.",
  parameters: {
    type: "object",

    properties: {
      url: {
        type: "string",
        description:
          "The full Azure DevOps work item URL (e.g., https://dev.azure.com/org/project/_workitems/edit/123)",
      },
    },
    required: ["url"],
  },
  handler: async ({ url }) => {
    const pat = process.env.ADO_PAT;
    if (!pat) {
      return { error: "ADO_PAT environment variable is not set" };
    }

    const { organization, project, workItemId } = parseAzureDevOpsUrl(url);

    const workItem = await getWorkItem(
      { organization, project, pat },
      workItemId,
    );

    return {
      id: workItem.id,
      title: workItem.title,
      type: workItem.type,
      state: workItem.state,
      assignedTo: workItem.assignedTo ?? "Unassigned",
      description: workItem.description,
      url: workItem.url,
    };
  },
});

const client = new CopilotClient();
const session = await client.createSession({
  model: "gpt-4.1",
  systemMessage: {
    content:
      "You are a helpful assistant. You can fetch weather for cities and fetch Azure DevOps tickets. When given a ticket URL, use the get_ticket tool to fetch it, then provide a clear summary of what the ticket is asking for.",
  },
  streaming: true,
  tools: [getWeather, getTicket],
});

session.on("assistant.message_delta", (event) => {
  process.stdout.write(event.data.deltaContent);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🤖  Assistant (type 'exit' to quit)");
console.log(
  "Try: 'What's the weather in Paris?' or paste an Azure DevOps ticket URL\n",
);

const prompt = () => {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      await client.stop();
      rl.close();
      return;
    }

    process.stdout.write("Assistant: ");
    await session.sendAndWait({ prompt: input });
    console.log("\n");
    prompt();
  });
};

prompt();
