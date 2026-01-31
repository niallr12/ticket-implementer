import { useState } from "react";

interface Ticket {
  id: number;
  title: string;
  description: string;
  type: string;
  state: string;
  assignedTo?: string;
  url: string;
}

interface Plan {
  summary: string;
  implementationPlan: string;
}

interface RepoInfo {
  localPath: string;
  branchName: string;
}

interface Props {
  onTicketFetched: (ticket: Ticket) => void;
  onPlanGenerated: (plan: Plan) => void;
  ticket: Ticket | null;
}

export default function TicketInput({ onTicketFetched, onPlanGenerated, ticket }: Props) {
  const [ticketUrl, setTicketUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloningRepo, setCloningRepo] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [error, setError] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const handleFetch = async () => {
    if (!ticketUrl.trim()) {
      setError("Please enter a ticket URL");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ticketUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch ticket");
      }

      onTicketFetched(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleCloneRepo = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a repository URL");
      return;
    }

    setCloningRepo(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to clone repository");
      }

      setRepoInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone repository");
    } finally {
      setCloningRepo(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!repoInfo) {
      setError("Please clone a repository first");
      return;
    }

    setGeneratingPlan(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate plan");
      }

      onPlanGenerated(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const isProcessing = loading || cloningRepo || generatingPlan;

  return (
    <div className="card">
      <div className="form-group">
        <label htmlFor="ticket-url">Azure DevOps Ticket URL</label>
        <input
          id="ticket-url"
          type="text"
          value={ticketUrl}
          onChange={(e) => setTicketUrl(e.target.value)}
          placeholder="https://dev.azure.com/org/project/_workitems/edit/123"
          disabled={isProcessing || !!ticket}
        />
      </div>

      {!ticket && (
        <button className="primary" onClick={handleFetch} disabled={loading}>
          {loading ? "Fetching..." : "Fetch Ticket"}
        </button>
      )}

      {error && <p className="error">{error}</p>}

      {ticket && (
        <>
          <div className="ticket-info">
            <h3>{ticket.title}</h3>
            <div className="ticket-meta">
              <span>{ticket.type}</span>
              <span>{ticket.state}</span>
              {ticket.assignedTo && <span>{ticket.assignedTo}</span>}
            </div>
            <div
              className="description"
              dangerouslySetInnerHTML={{ __html: ticket.description || "<em>No description</em>" }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="repo-url">Target Repository URL</label>
            <input
              id="repo-url"
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://dev.azure.com/org/_git/repo-name"
              disabled={isProcessing || !!repoInfo}
            />
          </div>

          {!repoInfo ? (
            <button
              className="primary"
              onClick={handleCloneRepo}
              disabled={cloningRepo || !repoUrl.trim()}
            >
              {cloningRepo ? "Cloning Repository..." : "Clone Repository"}
            </button>
          ) : (
            <>
              <div className="success-banner">
                <span className="success-icon">✓</span>
                <div>
                  <strong>Repository cloned</strong>
                  <div className="branch-name">{repoInfo.branchName}</div>
                </div>
              </div>

              <button
                className="primary"
                onClick={handleGeneratePlan}
                disabled={generatingPlan}
              >
                {generatingPlan ? "Generating Plan..." : "Generate Implementation Plan"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
