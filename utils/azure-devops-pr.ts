import { execSync } from "child_process";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface PRInfo {
  prId: number;
  title: string;
  description: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  status: string;
  repositoryName: string;
  repositoryUrl: string;
  url: string;
}

export interface ReviewerInfo {
  displayName: string;
  vote: number;
  isRequired: boolean;
}

export interface AssignedPR extends PRInfo {
  creationDate: string;
  reviewers: ReviewerInfo[];
}

export interface CloneForReviewResult {
  localPath: string;
  diff: string;
}

/**
 * Parse an Azure DevOps PR URL into its components.
 * Format: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}
 */
export function parsePRUrl(url: string): {
  organization: string;
  project: string;
  repoName: string;
  prId: number;
} {
  const match = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/
  );

  if (!match) {
    throw new Error(
      `Invalid Azure DevOps PR URL. Expected format: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}`
    );
  }

  return {
    organization: match[1],
    project: decodeURIComponent(match[2]),
    repoName: decodeURIComponent(match[3]),
    prId: parseInt(match[4], 10),
  };
}

/**
 * Fetch PR metadata from Azure DevOps API.
 */
export async function getPullRequest(url: string): Promise<PRInfo> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const { organization, project, repoName, prId } = parsePRUrl(url);

  const apiUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(
    project
  )}/_apis/git/repositories/${encodeURIComponent(
    repoName
  )}/pullrequests/${prId}?api-version=7.0`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch PR #${prId}: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  // Extract branch names (remove refs/heads/ prefix)
  const sourceBranch = (data.sourceRefName || "").replace("refs/heads/", "");
  const targetBranch = (data.targetRefName || "").replace("refs/heads/", "");

  // Build the web URL
  const prWebUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(
    project
  )}/_git/${encodeURIComponent(repoName)}/pullrequest/${prId}`;

  // Build the repo clone URL
  const repositoryUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(
    project
  )}/_git/${encodeURIComponent(repoName)}`;

  return {
    prId,
    title: data.title || "",
    description: data.description || "",
    author: data.createdBy?.displayName || "Unknown",
    sourceBranch,
    targetBranch,
    status: data.status || "unknown",
    repositoryName: repoName,
    repositoryUrl,
    url: prWebUrl,
  };
}

/**
 * Clone repo for review, checkout source branch, compute diff against target.
 */
export async function cloneForReview(
  repoUrl: string,
  sourceBranch: string,
  targetBranch: string
): Promise<CloneForReviewResult> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  // Extract repo name from URL for folder naming
  const repoNameMatch = repoUrl.match(/_git\/([^/\s?]+)/);
  const repoName = repoNameMatch ? decodeURIComponent(repoNameMatch[1]) : "repo";

  const workspacePath = join(process.cwd(), ".workspaces");
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  const timestamp = Date.now();
  const localPath = join(workspacePath, `review-${repoName}-${timestamp}`);

  // Build authenticated clone URL
  const encodedPat = encodeURIComponent(pat);
  const cloneUrl = repoUrl.replace(
    "https://",
    `https://${encodedPat}@`
  );

  try {
    console.log(`Cloning ${repoName} for review...`);
    execSync(`git clone "${cloneUrl}" "${localPath}"`, {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120000,
    });

    // Fetch all branches
    execSync("git fetch origin", {
      cwd: localPath,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 60000,
    });

    // Checkout the source branch
    console.log(`Checking out source branch: ${sourceBranch}...`);
    execSync(`git checkout "${sourceBranch}"`, {
      cwd: localPath,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Compute diff between target and source
    console.log(`Computing diff: origin/${targetBranch}...HEAD`);
    const diff = execSync(
      `git diff "origin/${targetBranch}"...HEAD`,
      {
        cwd: localPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    return { localPath, diff };
  } catch (error) {
    // Clean up on failure
    if (existsSync(localPath)) {
      rmSync(localPath, { recursive: true, force: true });
    }
    throw new Error(
      `Failed to clone for review: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get the authenticated user's ID from Azure DevOps connection data.
 */
export async function getCurrentUserId(): Promise<string> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const org = process.env.ADO_ORG;
  if (!org) {
    throw new Error("ADO_ORG environment variable is not set");
  }

  const apiUrl = `https://dev.azure.com/${org}/_apis/connectiondata?api-version=7.0-preview`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get user info: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.authenticatedUser.id;
}

/**
 * Get active pull requests assigned to the authenticated user as a reviewer.
 */
export async function getAssignedPullRequests(): Promise<AssignedPR[]> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  const org = process.env.ADO_ORG;
  if (!org) {
    throw new Error("ADO_ORG environment variable is not set");
  }

  const project = process.env.ADO_PROJECT;
  if (!project) {
    throw new Error("ADO_PROJECT environment variable is not set");
  }

  const userId = await getCurrentUserId();

  const apiUrl = `https://dev.azure.com/${org}/${encodeURIComponent(
    project
  )}/_apis/git/pullrequests?searchCriteria.reviewerId=${userId}&searchCriteria.status=active&$top=50&api-version=7.0`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch assigned PRs: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  return (data.value || []).map((pr: any) => {
    const repoName = pr.repository?.name || "unknown";
    const sourceBranch = (pr.sourceRefName || "").replace("refs/heads/", "");
    const targetBranch = (pr.targetRefName || "").replace("refs/heads/", "");
    const prId = pr.pullRequestId;

    const prWebUrl = `https://dev.azure.com/${org}/${encodeURIComponent(
      project
    )}/_git/${encodeURIComponent(repoName)}/pullrequest/${prId}`;

    const repositoryUrl = `https://dev.azure.com/${org}/${encodeURIComponent(
      project
    )}/_git/${encodeURIComponent(repoName)}`;

    const reviewers: ReviewerInfo[] = (pr.reviewers || []).map((r: any) => ({
      displayName: r.displayName || "Unknown",
      vote: r.vote || 0,
      isRequired: r.isRequired || false,
    }));

    return {
      prId,
      title: pr.title || "",
      description: pr.description || "",
      author: pr.createdBy?.displayName || "Unknown",
      sourceBranch,
      targetBranch,
      status: pr.status || "unknown",
      repositoryName: repoName,
      repositoryUrl,
      url: prWebUrl,
      creationDate: pr.creationDate || "",
      reviewers,
    };
  });
}

/**
 * Post a review comment as a new thread on an Azure DevOps pull request.
 */
export async function postReviewComment(
  pr: PRInfo,
  content: string
): Promise<{ threadId: number }> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error("ADO_PAT environment variable is not set");
  }

  // Extract org/project/repo from the PR URL
  const { organization, project, repoName } = parsePRUrl(pr.url);

  const apiUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(
    project
  )}/_apis/git/repositories/${encodeURIComponent(
    repoName
  )}/pullRequests/${pr.prId}/threads?api-version=7.1`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content,
          commentType: 1,
        },
      ],
      status: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to post review comment: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();
  return { threadId: data.id };
}

/**
 * Apply a code fix to a file in the cloned repo, commit, and push to the source branch.
 */
export async function applyFixAndPush(
  repoPath: string,
  filePath: string,
  oldContent: string,
  newContent: string,
  commitMessage: string,
  sourceBranch: string
): Promise<{ commitId: string }> {
  const fullPath = join(repoPath, filePath);

  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(fullPath, "utf-8");

  if (!fileContent.includes(oldContent)) {
    throw new Error(
      `Could not find the code to replace in ${filePath}. The file may have been modified.`
    );
  }

  const updatedContent = fileContent.replace(oldContent, newContent);
  writeFileSync(fullPath, updatedContent, "utf-8");

  try {
    execSync(`git add "${filePath}"`, {
      cwd: repoPath,
      stdio: "pipe",
      encoding: "utf-8",
    });

    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      cwd: repoPath,
      stdio: "pipe",
      encoding: "utf-8",
    });

    execSync(`git push origin "${sourceBranch}"`, {
      cwd: repoPath,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 60000,
    });

    const commitId = execSync("git rev-parse HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();

    return { commitId };
  } catch (error) {
    throw new Error(
      `Failed to commit and push fix: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Clean up a review workspace.
 */
export function cleanupReviewWorkspace(localPath: string): void {
  if (existsSync(localPath)) {
    rmSync(localPath, { recursive: true, force: true });
  }
}
