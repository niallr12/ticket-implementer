import { getWorkItem, type AzureDevOpsConfig } from "./utils/azure-devops.js";

const { ADO_ORG, ADO_PROJECT, ADO_PAT } = process.env;
const workItemId = parseInt(process.argv[2] ?? "", 10);

if (!ADO_ORG || !ADO_PROJECT || !ADO_PAT) {
  console.error("Error: Missing required environment variables");
  console.error("\n1. Copy .env.example to .env and fill in your values");
  console.error("2. Run: npx tsx --env-file=.env test-ado.ts <work-item-id>");
  process.exit(1);
}

if (isNaN(workItemId)) {
  console.error("Error: Please provide a work item ID");
  console.error("\nUsage: npx tsx --env-file=.env test-ado.ts <work-item-id>");
  process.exit(1);
}

const config: AzureDevOpsConfig = {
  organization: ADO_ORG,
  project: ADO_PROJECT,
  pat: ADO_PAT,
};

console.log(`Fetching work item ${workItemId} from ${config.organization}/${config.project}...\n`);

try {
  const workItem = await getWorkItem(config, workItemId);

  console.log("=== Work Item ===");
  console.log(`ID:       ${workItem.id}`);
  console.log(`Type:     ${workItem.type}`);
  console.log(`Title:    ${workItem.title}`);
  console.log(`State:    ${workItem.state}`);
  console.log(`Assigned: ${workItem.assignedTo ?? "Unassigned"}`);
  console.log(`URL:      ${workItem.url}`);
  console.log(`\n=== Description ===\n${workItem.description || "(empty)"}`);
} catch (error) {
  console.error("Failed to fetch work item:", error instanceof Error ? error.message : error);
  process.exit(1);
}
