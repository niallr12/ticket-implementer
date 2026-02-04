export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  pat: string; // Personal Access Token
}

export interface WorkItem {
  id: number;
  title: string;
  description: string;
  state: string;
  type: string;
  assignedTo?: string;
  url: string;
  figmaUrl?: string;
}

/**
 * Extract Figma URL from text content (may contain HTML)
 * Supports formats:
 * - https://www.figma.com/file/...
 * - https://www.figma.com/design/...
 * - https://figma.com/file/...
 * - https://figma.com/design/...
 * - https://www.figma.com/proto/...
 */
export function extractFigmaUrl(text: string): string | undefined {
  if (!text) return undefined;

  // Match Figma URLs - handles both www and non-www, and various path types
  const figmaRegex = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/[a-zA-Z0-9-_]+(?:\/[^\s"'<>)}\]]*)?/gi;

  const matches = text.match(figmaRegex);
  return matches?.[0];
}

export async function getWorkItem(
  config: AzureDevOpsConfig,
  workItemId: number
): Promise<WorkItem> {
  const { organization, project, pat } = config;

  const url = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch work item ${workItemId}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const fields = data.fields;
  const description = fields["System.Description"] ?? "";

  // Extract Figma URL from description if present
  const figmaUrl = extractFigmaUrl(description);

  return {
    id: data.id,
    title: fields["System.Title"] ?? "",
    description,
    state: fields["System.State"] ?? "",
    type: fields["System.WorkItemType"] ?? "",
    assignedTo: fields["System.AssignedTo"]?.displayName,
    url: data._links?.html?.href ?? "",
    figmaUrl,
  };
}
