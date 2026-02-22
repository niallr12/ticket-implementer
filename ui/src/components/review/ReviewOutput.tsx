import { useState, useEffect, useRef, useMemo } from "react";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

interface ReviewOutputProps {
  categories: string[];
  customFocusAreas: string[];
  model: string;
  onComplete: () => void;
  onBack: () => void;
}

interface DiscussionMessage {
  role: "user" | "assistant";
  content: string;
}

interface Finding {
  id: number;
  title: string;
  content: string;
  severity: string;
  selected: boolean;
  filePath: string | null;
  oldCode: string | null;
  newCode: string | null;
  fixApplied: boolean;
  fixError: string | null;
}

interface ParsedReview {
  summaryText: string;
  findings: Finding[];
  verdictText: string;
}

function parseFindings(text: string): ParsedReview {
  // Split off the Overall Verdict section
  const verdictMatch = text.match(/\n## Overall Verdict[\s\S]*$/);
  const verdictText = verdictMatch ? verdictMatch[0] : "";
  const withoutVerdict = verdictMatch
    ? text.slice(0, verdictMatch.index!)
    : text;

  // Split on ### headings to find individual findings
  const parts = withoutVerdict.split(/(?=^### )/m);

  // Everything before the first ### is the summary/preamble
  let summaryText = "";
  const findings: Finding[] = [];
  let id = 0;

  for (const part of parts) {
    if (part.startsWith("### ")) {
      const firstLine = part.split("\n")[0];
      const title = firstLine.replace(/^### /, "").trim();

      // Extract severity from patterns like "[Severity: Critical]" or "Severity: High -"
      let severity = "Medium";
      const sevMatch = title.match(
        /\bSeverity:\s*(Critical|High|Medium|Low)\b/i
      );
      if (sevMatch) {
        severity = sevMatch[1];
      } else if (/\bCritical\b/i.test(title)) {
        severity = "Critical";
      } else if (/\bHigh\b/i.test(title)) {
        severity = "High";
      } else if (/\bLow\b/i.test(title)) {
        severity = "Low";
      }

      // Extract file path from **File**: `path/to/file`
      const fileMatch = part.match(/\*\*File\*\*:\s*`([^`]+)`/);
      const filePath = fileMatch ? fileMatch[1].replace(/\s*\(line.*$/, "") : null;

      // Extract old/new code from diff blocks
      let oldCode: string | null = null;
      let newCode: string | null = null;
      const diffBlockMatch = part.match(/```diff\n([\s\S]*?)```/);
      if (diffBlockMatch) {
        const diffLines = diffBlockMatch[1].split("\n");
        const oldLines: string[] = [];
        const newLines: string[] = [];
        for (const line of diffLines) {
          if (line.startsWith("- ") || line.startsWith("-\t")) {
            oldLines.push(line.slice(2));
          } else if (line.startsWith("-") && line.length > 1 && line[1] !== "-") {
            oldLines.push(line.slice(1));
          } else if (line.startsWith("+ ") || line.startsWith("+\t")) {
            newLines.push(line.slice(2));
          } else if (line.startsWith("+") && line.length > 1 && line[1] !== "+") {
            newLines.push(line.slice(1));
          }
        }
        if (oldLines.length > 0) oldCode = oldLines.join("\n");
        if (newLines.length > 0) newCode = newLines.join("\n");
      }

      // Clean trailing --- separators from the content
      const content = part.replace(/\n---\s*$/, "").trim();

      findings.push({
        id: id++,
        title,
        content,
        severity,
        selected: true,
        filePath,
        oldCode,
        newCode,
        fixApplied: false,
        fixError: null,
      });
    } else {
      summaryText += part;
    }
  }

  return { summaryText: summaryText.trim(), findings, verdictText: verdictText.trim() };
}

function getSeverityClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "severity-critical";
    case "high":
      return "severity-high";
    case "medium":
      return "severity-medium";
    case "low":
      return "severity-low";
    default:
      return "severity-medium";
  }
}

export default function ReviewOutput({
  categories,
  customFocusAreas,
  model,
  onComplete,
  onBack,
}: ReviewOutputProps) {
  const [terminalLines, setTerminalLines] = useState<
    { type: string; content: string }[]
  >([]);
  const [reviewText, setReviewText] = useState("");
  const [isRunning, setIsRunning] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [discussionHistory, setDiscussionHistory] = useState<
    DiscussionMessage[]
  >([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postResult, setPostResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [verdictText, setVerdictText] = useState("");
  const [applyingFixId, setApplyingFixId] = useState<number | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const discussionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startReview = async () => {
      try {
        const res = await fetch("/api/review/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categories, customFocusAreas, model }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) return;

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "complete") {
                  // The server sends the clean, complete review text from
                  // sendAndWait() — use it directly instead of accumulating
                  // from stream deltas (which get garbled by tool calls).
                  const finalText = data.content || "";
                  setHasCompleted(true);
                  setReviewText(finalText);
                  const parsed = parseFindings(finalText);
                  setSummaryText(parsed.summaryText);
                  setFindings(parsed.findings);
                  setVerdictText(parsed.verdictText);
                }

                // Feed terminal display for progress
                if (data.type === "message" || data.type === "tool_start" || data.type === "tool_end" || data.type === "error") {
                  setTerminalLines((prev) => {
                    if (
                      data.type === "message" &&
                      prev.length > 0 &&
                      prev[prev.length - 1].type === "message"
                    ) {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content:
                          updated[updated.length - 1].content + data.content,
                      };
                      return updated;
                    }
                    return [...prev, data];
                  });
                }
              } catch {
                // skip invalid JSON
              }
            }
          }
        }
      } catch (err) {
        setTerminalLines((prev) => [
          ...prev,
          {
            type: "error",
            content:
              err instanceof Error ? err.message : "Review failed",
          },
        ]);
      } finally {
        setIsRunning(false);
      }
    };

    startReview();
  }, [categories, customFocusAreas, model]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalLines]);

  useEffect(() => {
    if (discussionRef.current) {
      discussionRef.current.scrollTop = discussionRef.current.scrollHeight;
    }
  }, [discussionHistory]);

  const handleAskQuestion = async () => {
    if (!question.trim() || isAsking) return;
    setIsAsking(true);

    try {
      const res = await fetch("/api/review/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDiscussionHistory(data.history);
      setQuestion("");
    } catch (err) {
      setDiscussionHistory((prev) => [
        ...prev,
        { role: "user", content: question },
        {
          role: "assistant",
          content: `Error: ${
            err instanceof Error ? err.message : "Failed to get response"
          }`,
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const clearDiscussion = async () => {
    await fetch("/api/review/clear-discussion", { method: "POST" });
    setDiscussionHistory([]);
  };

  const handlePostToPR = async () => {
    setIsPosting(true);
    setPostResult(null);

    // Compose markdown from selected findings only — no summary/verdict fluff
    const selectedFindings = findings.filter((f) => f.selected);
    const content = selectedFindings
      .map((f) => f.content)
      .join("\n\n---\n\n");

    try {
      const res = await fetch("/api/review/post-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPostResult({ success: true });
    } catch (err) {
      setPostResult({
        error:
          err instanceof Error ? err.message : "Failed to post review to PR",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleApplyFix = async (finding: Finding) => {
    if (!finding.filePath || !finding.oldCode || !finding.newCode) return;
    setApplyingFixId(finding.id);

    try {
      const res = await fetch("/api/review/apply-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: finding.filePath,
          oldContent: finding.oldCode,
          newContent: finding.newCode,
          findingTitle: finding.title,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id ? { ...f, fixApplied: true, fixError: null } : f
        )
      );
    } catch (err) {
      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id
            ? {
                ...f,
                fixError:
                  err instanceof Error
                    ? err.message
                    : "Failed to apply fix",
              }
            : f
        )
      );
    } finally {
      setApplyingFixId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isAsking) {
      handleAskQuestion();
    }
  };

  const toggleFinding = (id: number) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
    // Reset post state when selection changes
    setPostResult(null);
  };

  const selectAll = () => {
    setFindings((prev) => prev.map((f) => ({ ...f, selected: true })));
    setPostResult(null);
  };

  const deselectAll = () => {
    setFindings((prev) => prev.map((f) => ({ ...f, selected: false })));
    setPostResult(null);
  };

  const selectedCount = findings.filter((f) => f.selected).length;

  const summaryHtml = useMemo(
    () => (summaryText ? md.render(summaryText) : ""),
    [summaryText]
  );

  const verdictHtml = useMemo(
    () => (verdictText ? md.render(verdictText) : ""),
    [verdictText]
  );

  // Fallback: if no findings were parsed, render the whole review as one block
  const fallbackHtml = useMemo(
    () =>
      hasCompleted && reviewText && findings.length === 0
        ? md.render(reviewText)
        : "",
    [reviewText, hasCompleted, findings.length]
  );

  return (
    <div className="card">
      {/* Streaming terminal output */}
      <div className="progress-output" ref={outputRef}>
        {terminalLines.map((item, i) => (
          <div
            key={i}
            className={`progress-line ${
              item.type === "tool_start" || item.type === "tool_end"
                ? "tool"
                : item.type === "error"
                ? "error"
                : item.type === "complete"
                ? "complete"
                : ""
            }`}
          >
            {item.type === "tool_start" && `> ${item.content}`}
            {item.type === "message" && item.content}
            {item.type === "error" && `Error: ${item.content}`}
            {item.type === "complete" && item.content}
          </div>
        ))}
        {isRunning && <div className="progress-line">Reviewing...</div>}
      </div>

      {/* Structured review display with selectable findings */}
      {hasCompleted && findings.length > 0 && (
        <div className="review-findings" style={{ marginTop: "1.5rem" }}>
          {/* Summary (always included) */}
          {summaryHtml && (
            <div
              className="plan-content review-content"
              dangerouslySetInnerHTML={{ __html: summaryHtml }}
            />
          )}

          {/* Findings toolbar */}
          <div className="findings-toolbar">
            <span className="findings-count">
              {selectedCount} of {findings.length} findings selected
            </span>
            <div className="findings-actions">
              <button
                className="secondary"
                onClick={selectAll}
                disabled={selectedCount === findings.length}
                style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem" }}
              >
                Select All
              </button>
              <button
                className="secondary"
                onClick={deselectAll}
                disabled={selectedCount === 0}
                style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem" }}
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Individual finding cards */}
          {findings.map((finding) => (
            <div
              key={finding.id}
              className={`finding-card ${finding.selected ? "selected" : ""}`}
              onClick={() => toggleFinding(finding.id)}
            >
              <div className="finding-header">
                <input
                  type="checkbox"
                  checked={finding.selected}
                  onChange={() => toggleFinding(finding.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={`finding-severity ${getSeverityClass(finding.severity)}`}
                >
                  {finding.severity}
                </span>
                <span className="finding-title">{finding.title}</span>
              </div>
              <div
                className="finding-content review-content"
                dangerouslySetInnerHTML={{
                  __html: md.render(
                    finding.content.replace(/^### .*\n?/, "")
                  ),
                }}
              />
              {/* Apply Fix button — only when finding has actionable diff */}
              {finding.filePath && finding.oldCode && finding.newCode && (
                <div
                  className="finding-fix-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {finding.fixApplied ? (
                    <span className="finding-fix-applied">Fix applied and pushed</span>
                  ) : finding.fixError ? (
                    <div className="finding-fix-error">
                      <span>{finding.fixError}</span>
                      <button
                        className="finding-fix-button"
                        onClick={() => handleApplyFix(finding)}
                        disabled={applyingFixId !== null}
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <button
                      className="finding-fix-button"
                      onClick={() => handleApplyFix(finding)}
                      disabled={applyingFixId !== null}
                    >
                      {applyingFixId === finding.id
                        ? "Applying..."
                        : "Apply Fix"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Verdict (always included) */}
          {verdictHtml && (
            <div
              className="plan-content review-content"
              style={{ marginTop: "1rem" }}
              dangerouslySetInnerHTML={{ __html: verdictHtml }}
            />
          )}
        </div>
      )}

      {/* Fallback: if parser found no findings, show whole review */}
      {hasCompleted && fallbackHtml && (
        <div className="review-findings" style={{ marginTop: "1.5rem" }}>
          <h4 style={{ marginBottom: "0.75rem" }}>Review Findings</h4>
          <div
            className="plan-content review-content"
            dangerouslySetInnerHTML={{ __html: fallbackHtml }}
          />
        </div>
      )}

      {/* Discussion panel */}
      {hasCompleted && (
        <div className="discuss-section">
          <div className="discuss-header">
            <h4>Discuss Review</h4>
            <button
              className="discuss-toggle"
              onClick={() => setShowDiscussion(!showDiscussion)}
            >
              {showDiscussion ? "Hide" : "Show"}
            </button>
          </div>

          {showDiscussion && (
            <>
              <p className="discuss-hint">
                Ask follow-up questions about the review findings
              </p>

              {discussionHistory.length > 0 && (
                <div className="discussion-messages" ref={discussionRef}>
                  {discussionHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`discussion-message ${msg.role}`}
                    >
                      <span className="message-role">{msg.role}</span>
                      <div
                        className="message-content"
                        dangerouslySetInnerHTML={{
                          __html:
                            msg.role === "assistant"
                              ? md.render(msg.content)
                              : md.utils.escapeHtml(msg.content),
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="discuss-input-group">
                <input
                  type="text"
                  className="discuss-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about specific findings..."
                  disabled={isAsking}
                />
                <button
                  className="discuss-button"
                  onClick={handleAskQuestion}
                  disabled={isAsking || !question.trim()}
                >
                  {isAsking ? "..." : "Ask"}
                </button>
              </div>

              {discussionHistory.length > 0 && (
                <button
                  className="clear-discussion"
                  onClick={clearDiscussion}
                >
                  Clear discussion
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Post to PR feedback */}
      {postResult?.success && (
        <div className="success-banner" style={{ marginTop: "1rem" }}>
          <div className="success-icon">ok</div>
          <div>
            <strong>Review posted to PR</strong>
            <div className="branch-name">
              Comment thread created on Azure DevOps
            </div>
          </div>
        </div>
      )}
      {postResult?.error && (
        <div className="error" style={{ marginTop: "1rem" }}>
          {postResult.error}
        </div>
      )}

      {/* Actions */}
      <div className="button-group">
        <button className="secondary" onClick={onBack}>
          Back to Tool Selector
        </button>
        {hasCompleted && (
          <>
            <button
              className="primary"
              onClick={handlePostToPR}
              disabled={
                isPosting ||
                postResult?.success === true ||
                selectedCount === 0
              }
            >
              {isPosting
                ? "Posting..."
                : postResult?.success
                ? "Posted to PR"
                : `Post ${selectedCount > 0 ? selectedCount + " " : ""}Finding${selectedCount !== 1 ? "s" : ""} to PR`}
            </button>
            <button className="secondary" onClick={onComplete}>
              New Review
            </button>
          </>
        )}
      </div>
    </div>
  );
}
