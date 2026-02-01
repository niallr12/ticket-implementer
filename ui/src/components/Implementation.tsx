import { useEffect, useState, useRef, useMemo } from "react";

interface ProgressLine {
  type: "message" | "tool_start" | "tool_end" | "complete" | "error" | "pr_created" | "post_task" | "changes_pushed";
  content: string;
}

// Map internal Copilot SDK tool names to user-friendly descriptions
const TOOL_DESCRIPTIONS: Record<string, string> = {
  report_intent: "Planning next steps",
  view: "Reading file contents",
  edit: "Editing file",
  create: "Creating new file",
  delete: "Deleting file",
  run: "Running command",
  search: "Searching codebase",
  grep: "Searching for pattern",
  find: "Finding files",
  list: "Listing directory",
  terminal: "Running terminal command",
  bash: "Executing shell command",
  write: "Writing to file",
  read: "Reading file",
};

function formatToolName(rawName: string): string {
  // Extract tool name from "Executing: toolname" format
  const match = rawName.match(/^(Executing|Completed):\s*(\w+)/i);
  if (match) {
    const [, action, tool] = match;
    const friendlyName = TOOL_DESCRIPTIONS[tool.toLowerCase()] || tool;
    return `${action === "Executing" ? "🔧" : "✓"} ${friendlyName}`;
  }
  return rawName;
}

interface PostTask {
  id: string;
  name: string;
  command: string;
}

interface Props {
  onComplete: () => void;
  model: string;
  postTasks: PostTask[];
  canCreatePr: boolean;
}

export default function Implementation({ onComplete, model, postTasks, canCreatePr }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [changesPushed, setChangesPushed] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [commitPushError, setCommitPushError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const hasStarted = useRef(false);

  // Parse diff into individual files (simple parser)
  const parsedFiles = useMemo(() => {
    if (!diff || diff === "(No changes detected)") return [];

    const files: { name: string; lines: string[] }[] = [];
    let currentFile: { name: string; lines: string[] } | null = null;

    for (const line of diff.split("\n")) {
      // New file starts with "diff --git" or "+++ b/filename"
      if (line.startsWith("diff --git")) {
        const match = line.match(/diff --git a\/.+ b\/(.+)/);
        if (match) {
          currentFile = { name: match[1], lines: [] };
          files.push(currentFile);
        }
      } else if (line.startsWith("+++") && !currentFile) {
        // Fallback for diffs without "diff --git" header
        const match = line.match(/\+\+\+ [ab]?\/?(.*)/);
        if (match && match[1]) {
          currentFile = { name: match[1], lines: [] };
          files.push(currentFile);
        }
      } else if (currentFile && !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index ")) {
        currentFile.lines.push(line);
      }
    }

    return files;
  }, [diff]);

  // Reset selected file when diff changes
  useEffect(() => {
    setSelectedFileIndex(0);
  }, [diff]);

  const parseSSEStream = async (response: Response, onData: (data: ProgressLine) => void) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) as ProgressLine;
            onData(data);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  };

  const handleSSEData = (data: ProgressLine) => {
    // For message type, accumulate content into the last message line
    if (data.type === "message") {
      setLines((prev) => {
        const lastIndex = prev.length - 1;
        if (lastIndex >= 0 && prev[lastIndex].type === "message") {
          // Append to existing message
          const updated = [...prev];
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + data.content,
          };
          return updated;
        }
        // Start new message block
        return [...prev, data];
      });
    } else {
      // For other types (tool events, errors, etc.), add as new line
      setLines((prev) => [...prev, data]);
    }

    if (data.type === "complete") {
      setIsComplete(true);
      setIsRefining(false);
    } else if (data.type === "error") {
      setHasError(true);
      setIsRefining(false);
    } else if (data.type === "pr_created") {
      setPrUrl(data.content);
    } else if (data.type === "changes_pushed") {
      setChangesPushed(true);
    }
  };

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startImplementation = async () => {
      try {
        const response = await fetch("/api/ticket/implement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, postTasks }),
        });

        await parseSSEStream(response, handleSSEData);
      } catch (err) {
        setLines((prev) => [
          ...prev,
          { type: "error", content: err instanceof Error ? err.message : "Connection failed" },
        ]);
        setHasError(true);
      }
    };

    startImplementation();
  }, [model, postTasks]);

  // Fetch diff when implementation completes (and after refinements)
  useEffect(() => {
    if (isComplete && !changesPushed) {
      const fetchDiff = async () => {
        setLoadingDiff(true);
        try {
          const response = await fetch("/api/ticket/diff");
          const data = await response.json();
          if (response.ok) {
            setDiff(data.diff || "(No changes detected)");
          }
        } catch {
          // Silently fail - diff is optional
        } finally {
          setLoadingDiff(false);
        }
      };
      fetchDiff();
    }
  }, [isComplete, changesPushed, isRefining]);

  const handleCommitPush = async () => {
    setIsCommitting(true);
    setCommitPushError(null);
    try {
      const response = await fetch("/api/ticket/commit-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to commit and push");
      }
      setChangesPushed(true);
      setLines((prev) => [
        ...prev,
        { type: "message", content: `\n${data.message}\n` },
      ]);
    } catch (err) {
      setCommitPushError(err instanceof Error ? err.message : "Failed to commit and push");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRefineCode = async () => {
    if (!refineFeedback.trim()) return;

    setIsRefining(true);
    setIsComplete(false);
    setDiff(null);
    setLines((prev) => [
      ...prev,
      { type: "message", content: `\n--- Requesting Changes ---\nFeedback: ${refineFeedback}\n\n` },
    ]);

    try {
      const response = await fetch("/api/ticket/refine-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: refineFeedback, model }),
      });

      await parseSSEStream(response, handleSSEData);
      setRefineFeedback("");
    } catch (err) {
      setLines((prev) => [
        ...prev,
        { type: "error", content: err instanceof Error ? err.message : "Refinement failed" },
      ]);
      setHasError(true);
      setIsRefining(false);
    }
  };

  const handleCreatePr = async () => {
    setCreatingPr(true);
    setPrError(null);
    try {
      const response = await fetch("/api/ticket/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create PR");
      }
      setPrUrl(data.url);
    } catch (err) {
      setPrError(err instanceof Error ? err.message : "Failed to create PR");
    } finally {
      setCreatingPr(false);
    }
  };

  const getLineClass = (type: ProgressLine["type"]) => {
    switch (type) {
      case "tool_start":
      case "tool_end":
        return "progress-line tool";
      case "error":
        return "progress-line error";
      case "complete":
        return "progress-line complete";
      case "post_task":
        return "progress-line post-task";
      default:
        return "progress-line";
    }
  };

  const isWorking = !isComplete && !hasError;
  const canRefine = isComplete && !changesPushed && !isRefining;
  const canCommit = isComplete && !changesPushed && !isRefining && diff && diff !== "(No changes detected)";

  return (
    <div className="card">
      <h3>Implementation Progress</h3>

      <div className="progress-output">
        {lines.map((line, i) => (
          <div key={i} className={getLineClass(line.type)}>
            {line.type === "complete" && "🎉 "}
            {line.type === "error" && "❌ "}
            {line.type === "pr_created" && "🔗 "}
            {line.type === "post_task" && "⚡ "}
            {line.type === "pr_created"
              ? "Pull request created!"
              : (line.type === "tool_start" || line.type === "tool_end")
                ? formatToolName(line.content)
                : line.content}
          </div>
        ))}
        {isWorking && <div className="progress-line">▌</div>}
      </div>

      {/* Show diff after implementation (before commit) */}
      {isComplete && !changesPushed && loadingDiff && (
        <div className="diff-section">
          <h4>Git Diff (Uncommitted Changes)</h4>
          <div className="loading-diff">Loading diff...</div>
        </div>
      )}

      {isComplete && !changesPushed && diff !== null && (
        <div className="diff-section">
          <h4>Git Diff (Uncommitted Changes)</h4>
          {diff === "(No changes detected)" ? (
            <pre className="diff-output">{diff}</pre>
          ) : parsedFiles.length === 0 ? (
            <pre className="diff-output">{diff}</pre>
          ) : (
            <>
              {/* File tabs */}
              <div className="diff-tabs">
                {parsedFiles.map((file, index) => {
                  const shortName = file.name.split("/").pop() || file.name;
                  return (
                    <button
                      key={index}
                      className={`diff-tab ${selectedFileIndex === index ? "active" : ""}`}
                      onClick={() => setSelectedFileIndex(index)}
                      title={file.name}
                    >
                      {shortName}
                    </button>
                  );
                })}
              </div>
              {/* Selected file diff */}
              <pre className="diff-output colored">
                {parsedFiles[selectedFileIndex]?.lines.map((line, i) => {
                  let className = "diff-line";
                  if (line.startsWith("+")) className += " added";
                  else if (line.startsWith("-")) className += " removed";
                  else if (line.startsWith("@@")) className += " hunk";
                  return (
                    <div key={i} className={className}>
                      {line}
                    </div>
                  );
                })}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Request changes section - only show before commit */}
      {canRefine && (
        <div className="refine-code-section">
          <h4>Request Changes</h4>
          <p className="refine-hint">Not happy with the changes? Provide feedback to refine the implementation.</p>
          <div className="refine-input-group">
            <textarea
              className="refine-textarea"
              value={refineFeedback}
              onChange={(e) => setRefineFeedback(e.target.value)}
              placeholder="e.g., Add error handling, use a different approach, fix the styling..."
              rows={3}
              disabled={isRefining}
            />
            <button
              className="refine-button"
              onClick={handleRefineCode}
              disabled={isRefining || !refineFeedback.trim()}
            >
              {isRefining ? "Refining..." : "Request Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Commit & Push section - only show before commit */}
      {canCommit && (
        <div className="commit-section">
          <button
            className="primary commit-button"
            onClick={handleCommitPush}
            disabled={isCommitting}
          >
            {isCommitting ? "Committing & Pushing..." : "Commit & Push Changes"}
          </button>
          {commitPushError && <p className="error">{commitPushError}</p>}
        </div>
      )}

      {/* PR section - only show after commit */}
      {prUrl && (
        <div className="pr-banner">
          <div className="pr-icon">🎉</div>
          <div className="pr-info">
            <strong>Pull Request Created</strong>
            <a href={prUrl} target="_blank" rel="noopener noreferrer" className="pr-link">
              {prUrl}
            </a>
          </div>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pr-button"
          >
            View PR
          </a>
        </div>
      )}

      {changesPushed && !prUrl && canCreatePr && (
        <div className="create-pr-section">
          <button
            className="primary"
            onClick={handleCreatePr}
            disabled={creatingPr}
          >
            {creatingPr ? "Creating Pull Request..." : "Create Pull Request"}
          </button>
          {prError && <p className="error">{prError}</p>}
        </div>
      )}

      {changesPushed && !prUrl && !canCreatePr && (
        <div className="pr-not-available">
          PR creation is only available for Azure DevOps repositories.
        </div>
      )}

      {(isComplete || hasError) && !isRefining && (
        <div className="button-group">
          <button className="secondary" onClick={onComplete}>
            {hasError ? "Start Over" : "Done"}
          </button>
        </div>
      )}
    </div>
  );
}
