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

  return {
    id: data.id,
    title: fields["System.Title"] ?? "",
    description: fields["System.Description"] ?? "",
    state: fields["System.State"] ?? "",
    type: fields["System.WorkItemType"] ?? "",
    assignedTo: fields["System.AssignedTo"]?.displayName,
    url: data._links?.html?.href ?? "",
  };
}
