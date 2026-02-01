import { Router, type Request, type Response } from "express";
import { execSync } from "child_process";
import {
  fetchTicket,
  generatePlan,
  refinePlan,
  implementTicket,
  type TicketPlan,
} from "../services/copilot.js";
import type { WorkItem } from "../../utils/azure-devops.js";
import {
  cloneAndBranch,
  commitAndPush,
  cleanupWorkspace,
  createPullRequest,
  getDiff,
  useLocalFolder,
  isAzureDevOpsUrl,
  type CloneResult,
} from "../../utils/azure-devops-git.js";

interface PostTask {
  id: string;
  name: string;
  command: string;
}

export const ticketRouter = Router();

// Store ticket, plan, and repo info in memory for the session
let currentTicket: WorkItem | null = null;
let currentPlan: TicketPlan | null = null;
let currentRepo: CloneResult | null = null;
let currentRepoUrl: string | null = null;
let sourceType: "remote" | "local" = "remote";
let canCreatePr: boolean = false;

ticketRouter.post("/fetch", async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  try {
    currentTicket = await fetchTicket(url);
    res.json(currentTicket);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch ticket",
    });
  }
});

ticketRouter.post("/plan", async (req: Request, res: Response) => {
  if (!currentTicket) {
    res.status(400).json({ error: "No ticket fetched. Call /fetch first." });
    return;
  }

  try {
    currentPlan = await generatePlan(currentTicket);
    res.json({
      ticket: currentTicket,
      plan: currentPlan,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate plan",
    });
  }
});

ticketRouter.post("/clone", async (req: Request, res: Response) => {
  const { repoUrl } = req.body;

  if (!currentTicket) {
    res.status(400).json({ error: "No ticket fetched. Call /fetch first." });
    return;
  }

  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }

  try {
    // Clean up previous clone if exists
    if (currentRepo) {
      cleanupWorkspace(currentRepo.localPath);
    }

    currentRepoUrl = repoUrl;
    sourceType = "remote";
    canCreatePr = isAzureDevOpsUrl(repoUrl);
    currentRepo = await cloneAndBranch(
      repoUrl,
      currentTicket.id,
      currentTicket.title
    );

    res.json({
      localPath: currentRepo.localPath,
      branchName: currentRepo.branchName,
      sourceType,
      canCreatePr,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to clone repository",
    });
  }
});

ticketRouter.post("/implement", async (req: Request, res: Response) => {
  const { model, postTasks = [] } = req.body as { model?: string; postTasks?: PostTask[] };

  if (!currentTicket || !currentPlan) {
    res.status(400).json({ error: "No ticket or plan. Call /fetch and /plan first." });
    return;
  }

  // Set up SSE for streaming progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Use cloned repo path if available, otherwise current directory
  const workingDirectory = currentRepo?.localPath;
  const selectedModel = model || "claude-sonnet-4.5";

  try {
    res.write(`data: ${JSON.stringify({
      type: "message",
      content: `Using model: ${selectedModel}\n`,
    })}\n\n`);

    if (workingDirectory) {
      res.write(`data: ${JSON.stringify({
        type: "message",
        content: `Working in: ${workingDirectory}\nBranch: ${currentRepo?.branchName}\n\n`,
      })}\n\n`);
    }

    await implementTicket(
      currentTicket,
      currentPlan.implementationPlan,
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      },
      workingDirectory,
      selectedModel
    );

    // Run post-implementation tasks
    if (postTasks.length > 0 && workingDirectory) {
      res.write(`data: ${JSON.stringify({
        type: "message",
        content: "\n--- Running Post-Implementation Tasks ---\n",
      })}\n\n`);

      for (const task of postTasks) {
        res.write(`data: ${JSON.stringify({
          type: "post_task",
          content: `Running: ${task.name} (${task.command})`,
        })}\n\n`);

        try {
          const output = execSync(task.command, {
            cwd: workingDirectory,
            encoding: "utf-8",
            timeout: 300000, // 5 minute timeout
            stdio: ["pipe", "pipe", "pipe"],
          });

          // Send trimmed output (limit to last 50 lines to avoid flooding)
          const lines = output.trim().split("\n");
          const displayLines = lines.length > 50 ? lines.slice(-50) : lines;
          if (displayLines.length > 0 && displayLines[0]) {
            res.write(`data: ${JSON.stringify({
              type: "message",
              content: displayLines.join("\n") + "\n",
            })}\n\n`);
          }

          res.write(`data: ${JSON.stringify({
            type: "post_task",
            content: `✓ ${task.name} completed successfully`,
          })}\n\n`);
        } catch (taskError) {
          const errorMessage = taskError instanceof Error ? taskError.message : "Unknown error";
          res.write(`data: ${JSON.stringify({
            type: "error",
            content: `✗ ${task.name} failed: ${errorMessage}`,
          })}\n\n`);
          // Continue with other tasks even if one fails
        }
      }

      res.write(`data: ${JSON.stringify({
        type: "message",
        content: "--- Post-Implementation Tasks Complete ---\n\n",
      })}\n\n`);
    }

    // Don't auto-commit - let user review diff first
    res.write(`data: ${JSON.stringify({ type: "complete", content: "Implementation complete! Review the changes below." })}\n\n`);
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

ticketRouter.post("/refine", async (req: Request, res: Response) => {
  const { feedback } = req.body;

  if (!currentTicket || !currentPlan) {
    res.status(400).json({ error: "No ticket or plan. Call /fetch and /plan first." });
    return;
  }

  if (!feedback) {
    res.status(400).json({ error: "feedback is required" });
    return;
  }

  try {
    const refinedPlan = await refinePlan(
      currentTicket,
      currentPlan.implementationPlan,
      feedback
    );
    currentPlan = { ...currentPlan, implementationPlan: refinedPlan };
    res.json({ plan: currentPlan });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to refine plan",
    });
  }
});

ticketRouter.post("/update-plan", async (req: Request, res: Response) => {
  const { implementationPlan } = req.body;

  if (!currentPlan) {
    res.status(400).json({ error: "No plan exists." });
    return;
  }

  currentPlan = { ...currentPlan, implementationPlan };
  res.json({ plan: currentPlan });
});

ticketRouter.get("/current", (_req: Request, res: Response) => {
  res.json({
    ticket: currentTicket,
    plan: currentPlan,
  });
});

ticketRouter.post("/use-local", async (req: Request, res: Response) => {
  const { localPath } = req.body;

  if (!currentTicket) {
    res.status(400).json({ error: "No ticket fetched. Call /fetch first." });
    return;
  }

  if (!localPath) {
    res.status(400).json({ error: "localPath is required" });
    return;
  }

  try {
    // Clean up previous clone if exists
    if (currentRepo && sourceType === "remote") {
      cleanupWorkspace(currentRepo.localPath);
    }

    const result = await useLocalFolder(
      localPath,
      currentTicket.id,
      currentTicket.title
    );

    currentRepo = { localPath: result.localPath, branchName: result.branchName };
    currentRepoUrl = result.remoteUrl;
    sourceType = "local";
    canCreatePr = result.isAzureDevOps;

    res.json({
      localPath: result.localPath,
      branchName: result.branchName,
      sourceType,
      canCreatePr,
      remoteUrl: result.remoteUrl,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to use local folder",
    });
  }
});

ticketRouter.get("/diff", async (_req: Request, res: Response) => {
  if (!currentRepo) {
    res.status(400).json({ error: "No repository set up. Clone or use local folder first." });
    return;
  }

  try {
    const diff = getDiff(currentRepo.localPath);
    res.json({ diff });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get diff",
    });
  }
});

ticketRouter.post("/create-pr", async (req: Request, res: Response) => {
  if (!currentTicket || !currentPlan) {
    res.status(400).json({ error: "No ticket or plan. Call /fetch and /plan first." });
    return;
  }

  if (!currentRepo || !currentRepoUrl) {
    res.status(400).json({ error: "No repository set up." });
    return;
  }

  if (!canCreatePr) {
    res.status(400).json({ error: "PR creation not supported for this remote. Only Azure DevOps repositories are supported." });
    return;
  }

  try {
    const prDescription = `## Ticket\n[#${currentTicket.id}: ${currentTicket.title}](${currentTicket.url})\n\n## Implementation\nThis PR implements the changes for ticket #${currentTicket.id}.\n\n## Plan\n${currentPlan.implementationPlan}`;

    const pr = await createPullRequest(
      currentRepoUrl,
      currentRepo.branchName,
      `[#${currentTicket.id}] ${currentTicket.title}`,
      prDescription
    );

    res.json({
      id: pr.id,
      url: pr.url,
      title: pr.title,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create pull request",
    });
  }
});

ticketRouter.get("/repo-info", (_req: Request, res: Response) => {
  res.json({
    hasRepo: !!currentRepo,
    sourceType,
    canCreatePr,
    branchName: currentRepo?.branchName || null,
    localPath: currentRepo?.localPath || null,
  });
});

ticketRouter.get("/browse-folder", async (_req: Request, res: Response) => {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === "darwin") {
      // macOS: Use osascript to show native folder picker
      command = `osascript -e 'POSIX path of (choose folder with prompt "Select repository folder")'`;
    } else if (platform === "linux") {
      // Linux: Try zenity first, fall back to kdialog
      command = `zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory ~`;
    } else if (platform === "win32") {
      // Windows: Use PowerShell
      command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog; $folderBrowser.Description = 'Select repository folder'; $result = $folderBrowser.ShowDialog(); if ($result -eq 'OK') { $folderBrowser.SelectedPath }"`;
    } else {
      res.status(400).json({ error: "Unsupported platform" });
      return;
    }

    const result = execSync(command, { encoding: "utf-8", timeout: 60000 }).trim();

    if (result) {
      res.json({ path: result });
    } else {
      res.status(400).json({ error: "No folder selected" });
    }
  } catch (error) {
    // User cancelled the dialog
    res.status(400).json({ error: "Folder selection cancelled" });
  }
});

ticketRouter.post("/commit-push", async (req: Request, res: Response) => {
  if (!currentTicket) {
    res.status(400).json({ error: "No ticket. Call /fetch first." });
    return;
  }

  if (!currentRepo) {
    res.status(400).json({ error: "No repository set up." });
    return;
  }

  try {
    await commitAndPush(
      currentRepo.localPath,
      currentRepo.branchName,
      `Implement ticket #${currentTicket.id}: ${currentTicket.title}`
    );

    res.json({
      success: true,
      branchName: currentRepo.branchName,
      message: `Changes committed and pushed to branch: ${currentRepo.branchName}`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to commit and push",
    });
  }
});

ticketRouter.post("/refine-code", async (req: Request, res: Response) => {
  const { feedback, model } = req.body;

  if (!currentTicket || !currentPlan) {
    res.status(400).json({ error: "No ticket or plan. Call /fetch and /plan first." });
    return;
  }

  if (!currentRepo) {
    res.status(400).json({ error: "No repository set up." });
    return;
  }

  if (!feedback) {
    res.status(400).json({ error: "feedback is required" });
    return;
  }

  // Set up SSE for streaming progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const selectedModel = model || "claude-sonnet-4.5";

  try {
    res.write(`data: ${JSON.stringify({
      type: "message",
      content: `Refining code based on feedback...\nUsing model: ${selectedModel}\n\n`,
    })}\n\n`);

    // Create a refinement prompt that includes the feedback
    const refinementPlan = `
Previous implementation context:
${currentPlan.implementationPlan}

User feedback for refinement:
${feedback}

Please make the requested changes to the code based on the feedback above.
`;

    await implementTicket(
      currentTicket,
      refinementPlan,
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      },
      currentRepo.localPath,
      selectedModel
    );

    res.write(`data: ${JSON.stringify({ type: "complete", content: "Refinement complete! Review the updated changes." })}\n\n`);
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
