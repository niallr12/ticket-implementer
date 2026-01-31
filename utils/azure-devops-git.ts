import { execSync } from "child_process";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

export interface RepoConfig {
  organization: string;
  project: string;
  repoName: string;
  pat: string;
}

export interface CloneResult {
  localPath: string;
  branchName: string;
}

function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

export function parseAzureDevOpsRepoUrl(url: string): Omit<RepoConfig, "pat"> {
  // Format 1: https://dev.azure.com/{org}/{project}/_git/{repo}
  // Format 2: https://dev.azure.com/{org}/_git/{repo} (project = repo)
  const matchWithProject = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/\s?]+)/
  );

  if (matchWithProject) {
    return {
      organization: matchWithProject[1],
      project: decodeURIComponent(matchWithProject[2]),
      repoName: decodeURIComponent(matchWithProject[3]),
    };
  }

  // Try format without explicit project
  const matchDirectRepo = url.match(
    /dev\.azure\.com\/([^/]+)\/_git\/([^/\s?]+)/
  );

  if (matchDirectRepo) {
    const repoName = decodeURIComponent(matchDirectRepo[2]);
    return {
      organization: matchDirectRepo[1],
      project: repoName, // Use repo name as project name
      repoName,
    };
  }

  throw new Error(`Invalid Azure DevOps repo URL: ${url}`);
}

export function buildCloneUrl(config: RepoConfig): string {
  // Use PAT in URL for authentication
  const encodedPat = encodeURIComponent(config.pat);
  return `https://${encodedPat}@dev.azure.com/${config.organization}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(config.repoName)}`;
}

export async function cloneAndBranch(
  repoUrl: string,
  ticketId: number,
  ticketTitle: string,
  basePath?: string
): Promise<CloneResult> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const { organization, project, repoName } = parseAzureDevOpsRepoUrl(repoUrl);
  const config: RepoConfig = { organization, project, repoName, pat };

  // Create workspace directory
  const workspacePath = basePath || join(process.cwd(), ".workspaces");
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  // Create unique folder for this clone
  const timestamp = Date.now();
  const localPath = join(workspacePath, `${repoName}-${timestamp}`);

  // Generate branch name from ticket
  const branchName = `feature/${ticketId}-${sanitizeBranchName(ticketTitle)}`;

  const cloneUrl = buildCloneUrl(config);

  try {
    console.log(`Cloning ${repoName}...`);
    execSync(`git clone "${cloneUrl}" "${localPath}"`, {
      stdio: "pipe",
      encoding: "utf-8",
    });

    console.log(`Creating branch ${branchName}...`);
    execSync(`git checkout -b "${branchName}"`, {
      cwd: localPath,
      stdio: "pipe",
      encoding: "utf-8",
    });

    return { localPath, branchName };
  } catch (error) {
    // Clean up on failure
    if (existsSync(localPath)) {
      rmSync(localPath, { recursive: true, force: true });
    }
    throw new Error(
      `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function commitAndPush(
  localPath: string,
  branchName: string,
  commitMessage: string
): Promise<void> {
  try {
    // Stage all changes
    execSync("git add -A", {
      cwd: localPath,
      stdio: "pipe",
    });

    // Check if there are changes to commit
    const status = execSync("git status --porcelain", {
      cwd: localPath,
      encoding: "utf-8",
    });

    if (!status.trim()) {
      console.log("No changes to commit");
      return;
    }

    // Commit
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      cwd: localPath,
      stdio: "pipe",
    });

    // Push
    console.log(`Pushing branch ${branchName}...`);
    execSync(`git push -u origin "${branchName}"`, {
      cwd: localPath,
      stdio: "pipe",
    });

    console.log("Changes pushed successfully");
  } catch (error) {
    throw new Error(
      `Failed to commit and push: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export function cleanupWorkspace(localPath: string): void {
  if (existsSync(localPath)) {
    rmSync(localPath, { recursive: true, force: true });
  }
}

export interface PullRequestResult {
  id: number;
  url: string;
  title: string;
}

export async function createPullRequest(
  repoUrl: string,
  sourceBranch: string,
  title: string,
  description: string
): Promise<PullRequestResult> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const { organization, project, repoName } = parseAzureDevOpsRepoUrl(repoUrl);

  // Azure DevOps API endpoint for creating pull requests
  const apiUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests?api-version=7.1`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    },
    body: JSON.stringify({
      sourceRefName: `refs/heads/${sourceBranch}`,
      targetRefName: "refs/heads/main",
      title,
      description,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create pull request: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // Construct the web URL for the PR
  const prWebUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}/pullrequest/${data.pullRequestId}`;

  return {
    id: data.pullRequestId,
    url: prWebUrl,
    title: data.title,
  };
}
