import { Router, type Request, type Response } from "express";
import {
  getPullRequest,
  cloneForReview,
  cleanupReviewWorkspace,
  getAssignedPullRequests,
  postReviewComment,
  applyFixAndPush,
  type PRInfo,
} from "../../utils/azure-devops-pr.js";
import {
  performReview,
  discussReview,
  DEFAULT_REVIEW_CATEGORIES,
  type DiscussionMessage,
} from "../services/review-copilot.js";

export const reviewRouter = Router();

// In-memory state for the review session
let currentPR: PRInfo | null = null;
let currentDiff: string | null = null;
let currentRepoPath: string | null = null;
let currentCategories: string[] = DEFAULT_REVIEW_CATEGORIES
  .filter((c) => c.defaultEnabled)
  .map((c) => c.id);
let reviewDiscussionHistory: DiscussionMessage[] = [];

// Fetch PR metadata
reviewRouter.post("/fetch-pr", async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  try {
    currentPR = await getPullRequest(url);
    res.json(currentPR);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to fetch PR",
    });
  }
});

// Get PRs assigned to the authenticated user as a reviewer
reviewRouter.get("/my-reviews", async (_req: Request, res: Response) => {
  try {
    const prs = await getAssignedPullRequests();
    res.json({ prs });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch assigned PRs",
    });
  }
});

// Select a PR from the assigned list (avoids redundant API call)
reviewRouter.post("/select-pr", async (req: Request, res: Response) => {
  const { pr } = req.body;

  if (!pr) {
    res.status(400).json({ error: "PR data is required" });
    return;
  }

  try {
    currentPR = {
      prId: pr.prId,
      title: pr.title,
      description: pr.description,
      author: pr.author,
      sourceBranch: pr.sourceBranch,
      targetBranch: pr.targetBranch,
      status: pr.status,
      repositoryName: pr.repositoryName,
      repositoryUrl: pr.repositoryUrl,
      url: pr.url,
    };
    res.json(currentPR);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to select PR",
    });
  }
});

// Clone repo and compute diff
reviewRouter.post("/clone-for-review", async (req: Request, res: Response) => {
  if (!currentPR) {
    res.status(400).json({ error: "No PR fetched. Call /fetch-pr first." });
    return;
  }

  try {
    // Clean up previous clone if exists
    if (currentRepoPath) {
      cleanupReviewWorkspace(currentRepoPath);
    }

    const result = await cloneForReview(
      currentPR.repositoryUrl,
      currentPR.sourceBranch,
      currentPR.targetBranch
    );

    currentRepoPath = result.localPath;
    currentDiff = result.diff;

    res.json({
      localPath: result.localPath,
      diffLength: result.diff.length,
      diffPreview:
        result.diff.length > 2000
          ? result.diff.substring(0, 2000) + "\n... (truncated)"
          : result.diff,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to clone for review",
    });
  }
});

// Start the review (SSE streaming)
reviewRouter.post("/start", async (req: Request, res: Response) => {
  const { categories, customFocusAreas = [], model } = req.body;

  if (!currentPR || !currentDiff) {
    res.status(400).json({
      error: "No PR or diff available. Call /fetch-pr and /clone-for-review first.",
    });
    return;
  }

  // Update categories if provided
  if (categories) {
    currentCategories = categories;
  }

  const selectedModel = model || "claude-sonnet-4.5";

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    res.write(
      `data: ${JSON.stringify({
        type: "message",
        content: `Starting review with model: ${selectedModel}\n`,
      })}\n\n`
    );

    // Clear discussion history for new review
    reviewDiscussionHistory = [];

    await performReview(
      currentPR,
      currentDiff,
      currentCategories,
      customFocusAreas,
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      },
      currentRepoPath || undefined,
      selectedModel
    );
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        content: error instanceof Error ? error.message : "Unknown error",
      })}\n\n`
    );
  } finally {
    res.end();
  }
});

// Discuss review findings
reviewRouter.post("/discuss", async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!currentPR || !currentDiff) {
    res.status(400).json({ error: "No review context available." });
    return;
  }

  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  try {
    const response = await discussReview(
      currentPR,
      currentDiff,
      question,
      reviewDiscussionHistory,
      currentRepoPath || undefined
    );

    reviewDiscussionHistory.push({ role: "user", content: question });
    reviewDiscussionHistory.push({ role: "assistant", content: response });

    // Keep history manageable
    if (reviewDiscussionHistory.length > 20) {
      reviewDiscussionHistory = reviewDiscussionHistory.slice(-20);
    }

    res.json({ response, history: reviewDiscussionHistory });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to discuss review",
    });
  }
});

// Get discussion history
reviewRouter.get("/discussion-history", (_req: Request, res: Response) => {
  res.json({ history: reviewDiscussionHistory });
});

// Clear discussion history
reviewRouter.post("/clear-discussion", (_req: Request, res: Response) => {
  reviewDiscussionHistory = [];
  res.json({ success: true });
});

// Get default review categories
reviewRouter.get("/categories", (_req: Request, res: Response) => {
  res.json({ categories: DEFAULT_REVIEW_CATEGORIES });
});

// Post review as a comment on the PR
reviewRouter.post("/post-comment", async (req: Request, res: Response) => {
  if (!currentPR) {
    res.status(400).json({ error: "No PR selected. Cannot post comment." });
    return;
  }

  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: "Comment content is required" });
    return;
  }

  try {
    const result = await postReviewComment(currentPR, content);
    res.json({ success: true, threadId: result.threadId });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to post review comment",
    });
  }
});

// Apply a fix directly to the PR branch
reviewRouter.post("/apply-fix", async (req: Request, res: Response) => {
  if (!currentPR) {
    res.status(400).json({ error: "No PR selected." });
    return;
  }

  if (!currentRepoPath) {
    res.status(400).json({ error: "No cloned repo available. Clone the repo first." });
    return;
  }

  const { filePath, oldContent, newContent, findingTitle } = req.body;

  if (!filePath || !oldContent || !newContent) {
    res.status(400).json({ error: "filePath, oldContent, and newContent are required" });
    return;
  }

  const commitMessage = `fix: ${findingTitle || "Apply review fix"}`;

  try {
    const result = await applyFixAndPush(
      currentRepoPath,
      filePath,
      oldContent,
      newContent,
      commitMessage,
      currentPR.sourceBranch
    );
    res.json({ success: true, commitId: result.commitId });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to apply fix",
    });
  }
});

// Reset all state
reviewRouter.post("/reset", (_req: Request, res: Response) => {
  if (currentRepoPath) {
    cleanupReviewWorkspace(currentRepoPath);
  }

  currentPR = null;
  currentDiff = null;
  currentRepoPath = null;
  currentCategories = DEFAULT_REVIEW_CATEGORIES
    .filter((c) => c.defaultEnabled)
    .map((c) => c.id);
  reviewDiscussionHistory = [];

  res.json({ success: true });
});
