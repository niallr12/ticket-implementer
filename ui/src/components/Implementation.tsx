import { useEffect, useState } from "react";

interface ProgressLine {
  type: "message" | "tool_start" | "tool_end" | "complete" | "error" | "pr_created" | "post_task";
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
}

export default function Implementation({ onComplete, model, postTasks }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/ticket/implement", {
      withCredentials: false,
    });

    // For POST requests, we need to use fetch with SSE parsing
    const startImplementation = async () => {
      try {
        const response = await fetch("/api/ticket/implement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, postTasks }),
        });

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
                } else if (data.type === "error") {
                  setHasError(true);
                } else if (data.type === "pr_created") {
                  setPrUrl(data.content);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        setLines((prev) => [
          ...prev,
          { type: "error", content: err instanceof Error ? err.message : "Connection failed" },
        ]);
        setHasError(true);
      }
    };

    startImplementation();

    return () => {
      eventSource.close();
    };
  }, []);

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
        {!isComplete && !hasError && <div className="progress-line">▌</div>}
      </div>

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

      {(isComplete || hasError) && (
        <div className="button-group">
          <button className="primary" onClick={onComplete}>
            {hasError ? "Try Again" : "Done"}
          </button>
        </div>
      )}
    </div>
  );
}
