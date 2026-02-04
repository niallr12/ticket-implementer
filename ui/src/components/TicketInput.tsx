import { useState } from "react";
import InstructionSelector from "./InstructionSelector";

interface Ticket {
  id: number;
  title: string;
  description: string;
  type: string;
  state: string;
  assignedTo?: string;
  url: string;
  figmaUrl?: string;
}

interface Plan {
  summary: string;
  implementationPlan: string;
}

export interface RepoInfo {
  localPath: string;
  branchName: string;
  sourceType: "remote" | "local";
  canCreatePr: boolean;
  remoteUrl?: string | null;
}

interface Props {
  onTicketFetched: (ticket: Ticket) => void;
  onPlanGenerated: (plan: Plan) => void;
  onRepoReady: (info: RepoInfo) => void;
  ticket: Ticket | null;
}

export default function TicketInput({ onTicketFetched, onPlanGenerated, onRepoReady, ticket }: Props) {
  const [ticketUrl, setTicketUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [sourceMode, setSourceMode] = useState<"remote" | "local">("remote");
  const [loading, setLoading] = useState(false);
  const [cloningRepo, setCloningRepo] = useState(false);
  const [settingUpLocal, setSettingUpLocal] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [error, setError] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [instructionsReady, setInstructionsReady] = useState(false);
  const [addedInstructions, setAddedInstructions] = useState<string[]>([]);

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
      onRepoReady(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone repository");
    } finally {
      setCloningRepo(false);
    }
  };

  const handleUseLocalFolder = async () => {
    if (!localPath.trim()) {
      setError("Please enter a local folder path");
      return;
    }

    setSettingUpLocal(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/use-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPath }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to set up local folder");
      }

      setRepoInfo(data);
      onRepoReady(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set up local folder");
    } finally {
      setSettingUpLocal(false);
    }
  };

  const handleInstructionsComplete = (instructions: string[]) => {
    setAddedInstructions(instructions);
    setInstructionsReady(true);
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

  const isProcessing = loading || cloningRepo || settingUpLocal || generatingPlan;

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
            {ticket.figmaUrl && (
              <div className="figma-link">
                <span className="figma-icon">
                  <svg width="16" height="16" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE"/>
                    <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
                    <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
                    <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
                    <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
                  </svg>
                </span>
                <a href={ticket.figmaUrl} target="_blank" rel="noopener noreferrer">
                  View Figma Design
                </a>
              </div>
            )}
          </div>

          <div className="source-toggle">
            <label className="toggle-option">
              <input
                type="radio"
                name="source-mode"
                value="remote"
                checked={sourceMode === "remote"}
                onChange={() => setSourceMode("remote")}
                disabled={isProcessing || !!repoInfo}
              />
              Clone from URL
            </label>
            <label className="toggle-option">
              <input
                type="radio"
                name="source-mode"
                value="local"
                checked={sourceMode === "local"}
                onChange={() => setSourceMode("local")}
                disabled={isProcessing || !!repoInfo}
              />
              Use Local Folder
            </label>
          </div>

          {sourceMode === "remote" ? (
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
          ) : (
            <div className="form-group">
              <label htmlFor="local-path">Local Folder Path</label>
              <div className="path-input-group">
                <input
                  id="local-path"
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/path/to/your/repository"
                  disabled={isProcessing || !!repoInfo}
                />
                <button
                  type="button"
                  className="browse-button"
                  onClick={async () => {
                    try {
                      const response = await fetch("/api/ticket/browse-folder");
                      const data = await response.json();
                      if (response.ok && data.path) {
                        setLocalPath(data.path);
                      }
                    } catch {
                      // User cancelled or error occurred
                    }
                  }}
                  disabled={isProcessing || !!repoInfo}
                >
                  Browse
                </button>
              </div>
              <div className="input-hint">
                Tip: In Finder, right-click folder → "Copy as Pathname", then paste
              </div>
            </div>
          )}

          {!repoInfo ? (
            sourceMode === "remote" ? (
              <button
                className="primary"
                onClick={handleCloneRepo}
                disabled={cloningRepo || !repoUrl.trim()}
              >
                {cloningRepo ? "Cloning Repository..." : "Clone Repository"}
              </button>
            ) : (
              <button
                className="primary"
                onClick={handleUseLocalFolder}
                disabled={settingUpLocal || !localPath.trim()}
              >
                {settingUpLocal ? "Setting Up..." : "Use Local Folder"}
              </button>
            )
          ) : (
            <>
              {addedInstructions.length > 0 && (
                <div className="added-instructions">
                  <span className="added-instructions-label">Instructions:</span>
                  {addedInstructions.map((name) => (
                    <span key={name} className="instruction-pill">{name}</span>
                  ))}
                </div>
              )}

              <div className="success-banner">
                <span className="success-icon">✓</span>
                <div>
                  <strong>{repoInfo.sourceType === "local" ? "Local folder ready" : "Repository cloned"}</strong>
                  <div className="branch-name">{repoInfo.branchName}</div>
                  {repoInfo.sourceType === "local" && !repoInfo.canCreatePr && (
                    <div className="warning-text">PR creation not available (non-Azure DevOps remote)</div>
                  )}
                </div>
              </div>

              {!instructionsReady && (
                <InstructionSelector
                  onComplete={handleInstructionsComplete}
                  disabled={generatingPlan}
                />
              )}

              {instructionsReady && (
                <button
                  className="primary"
                  onClick={handleGeneratePlan}
                  disabled={generatingPlan}
                >
                  {generatingPlan ? "Generating Plan..." : "Generate Implementation Plan"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
