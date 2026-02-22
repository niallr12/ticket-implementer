import { useState, useEffect } from "react";

export interface PRMetadata {
  prId: number;
  title: string;
  description: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  status: string;
  repositoryName: string;
  url: string;
}

interface ReviewerInfo {
  displayName: string;
  vote: number;
  isRequired: boolean;
}

interface AssignedPRItem extends PRMetadata {
  creationDate: string;
  reviewers: ReviewerInfo[];
  repositoryUrl: string;
}

interface PRInputProps {
  onPRFetched: (pr: PRMetadata) => void;
  onCloneComplete: (diffPreview: string) => void;
  pr: PRMetadata | null;
  isCloned: boolean;
}

function getVoteClass(vote: number): string {
  switch (vote) {
    case 10:
      return "vote-approved";
    case 5:
      return "vote-approved-with-suggestions";
    case -5:
      return "vote-waiting";
    case -10:
      return "vote-rejected";
    default:
      return "vote-none";
  }
}

function getVoteLabel(vote: number): string {
  switch (vote) {
    case 10:
      return "Approved";
    case 5:
      return "Approved w/ suggestions";
    case -5:
      return "Waiting for author";
    case -10:
      return "Rejected";
    default:
      return "No vote";
  }
}

export default function PRInput({
  onPRFetched,
  onCloneComplete,
  pr,
  isCloned,
}: PRInputProps) {
  const [mode, setMode] = useState<"url" | "my-reviews">("url");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");
  const [assignedPRs, setAssignedPRs] = useState<AssignedPRItem[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);

  const fetchAssignedPRs = async () => {
    setLoadingPRs(true);
    setError("");

    try {
      const res = await fetch("/api/review/my-reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssignedPRs(data.prs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch assigned PRs"
      );
    } finally {
      setLoadingPRs(false);
    }
  };

  useEffect(() => {
    if (mode === "my-reviews" && !pr) {
      fetchAssignedPRs();
    }
  }, [mode]);

  const handleSelectPR = async (selectedPR: AssignedPRItem) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/review/select-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr: selectedPR }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onPRFetched(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select PR");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchPR = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/review/fetch-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onPRFetched(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PR");
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    setError("");

    try {
      const res = await fetch("/api/review/clone-for-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCloneComplete(data.diffPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone repo");
    } finally {
      setCloning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleFetchPR();
    }
  };

  return (
    <div className="card">
      {!pr && (
        <div className="pr-mode-toggle">
          <button
            className={`pr-mode-button ${mode === "url" ? "active" : ""}`}
            onClick={() => { setMode("url"); setError(""); }}
          >
            Paste URL
          </button>
          <button
            className={`pr-mode-button ${mode === "my-reviews" ? "active" : ""}`}
            onClick={() => { setMode("my-reviews"); setError(""); }}
          >
            My Reviews
          </button>
        </div>
      )}

      {mode === "url" && !pr && (
        <>
          <div className="form-group">
            <label>Azure DevOps Pull Request URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}"
              disabled={loading}
            />
          </div>

          <button
            className="primary"
            onClick={handleFetchPR}
            disabled={loading || !url.trim()}
          >
            {loading ? "Fetching PR..." : "Fetch PR"}
          </button>
        </>
      )}

      {mode === "my-reviews" && !pr && (
        <div className="assigned-prs-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <label style={{ margin: 0 }}>Pull requests assigned to you</label>
            <button
              className="secondary"
              onClick={fetchAssignedPRs}
              disabled={loadingPRs}
              style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
            >
              Refresh
            </button>
          </div>

          {loadingPRs && (
            <div className="loading-text">Loading your assigned PRs...</div>
          )}

          {!loadingPRs && assignedPRs.length === 0 && !error && (
            <div className="empty-text">
              No active pull requests assigned to you for review.
            </div>
          )}

          {!loadingPRs && assignedPRs.length > 0 && (
            <div className="assigned-pr-list">
              {assignedPRs.map((apr) => (
                <div
                  key={apr.prId}
                  className="assigned-pr-card"
                  onClick={() => !loading && handleSelectPR(apr)}
                >
                  <div className="assigned-pr-title">{apr.title}</div>
                  <div className="assigned-pr-meta">
                    <span>PR #{apr.prId}</span>
                    <span>{apr.repositoryName}</span>
                    <span>{apr.author}</span>
                  </div>
                  <div className="pr-branch-info">
                    <span className="branch-label">{apr.sourceBranch}</span>
                    <span className="branch-arrow"> → </span>
                    <span className="branch-label">{apr.targetBranch}</span>
                  </div>
                  {apr.reviewers.length > 0 && (
                    <div className="assigned-pr-reviewers">
                      {apr.reviewers.map((r, i) => (
                        <span
                          key={i}
                          className={`reviewer-badge ${getVoteClass(r.vote)}`}
                          title={getVoteLabel(r.vote)}
                        >
                          {r.displayName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {pr && (
        <div className="ticket-info" style={{ marginTop: "1.5rem" }}>
          <h3>{pr.title}</h3>
          <div className="ticket-meta">
            <span>PR #{pr.prId}</span>
            <span>{pr.status}</span>
            <span>{pr.author}</span>
            <span>{pr.repositoryName}</span>
          </div>
          <div className="pr-branch-info">
            <span className="branch-label">{pr.sourceBranch}</span>
            <span className="branch-arrow"> → </span>
            <span className="branch-label">{pr.targetBranch}</span>
          </div>
          {pr.description && (
            <div className="description" style={{ marginTop: "0.75rem" }}>
              <div dangerouslySetInnerHTML={{ __html: pr.description }} />
            </div>
          )}

          {!isCloned && (
            <button
              className="primary"
              onClick={handleClone}
              disabled={cloning}
              style={{ marginTop: "1rem" }}
            >
              {cloning
                ? "Cloning repository..."
                : "Clone Repo & Compute Diff"}
            </button>
          )}

          {isCloned && (
            <div className="success-banner" style={{ marginTop: "1rem" }}>
              <div className="success-icon">ok</div>
              <div>
                <strong>Repository cloned and diff computed</strong>
                <div className="branch-name">
                  Ready for review configuration
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
