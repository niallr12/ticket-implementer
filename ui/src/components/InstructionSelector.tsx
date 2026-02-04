import { useState, useEffect } from "react";

interface SharedInstructionFile {
  filename: string;
  displayName: string;
  path: string;
  existsInWorkspace: boolean;
}

interface Props {
  onComplete: (addedInstructions: string[]) => void;
  disabled?: boolean;
}

export default function InstructionSelector({ onComplete, disabled }: Props) {
  const [instructions, setInstructions] = useState<SharedInstructionFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [copyResult, setCopyResult] = useState<{ copied: string[]; skipped: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchInstructions();
  }, []);

  const fetchInstructions = async () => {
    setLoading(true);
    setError("");
    setNotConfigured(false);

    try {
      const response = await fetch("/api/ticket/shared-instructions");
      const data = await response.json();

      if (!response.ok) {
        if (data.notConfigured) {
          setNotConfigured(true);
        } else {
          throw new Error(data.error || "Failed to load instructions");
        }
        return;
      }

      setInstructions(data.instructions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load instructions");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (filename: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filename)) {
      newSelected.delete(filename);
    } else {
      newSelected.add(filename);
    }
    setSelectedFiles(newSelected);
  };

  const handleCopyAndContinue = async () => {
    if (selectedFiles.size === 0) {
      onComplete([]);
      return;
    }

    setCopying(true);
    setError("");

    try {
      const filesToCopy = instructions.filter(
        (f) => selectedFiles.has(f.filename) && !f.existsInWorkspace
      );

      const response = await fetch("/api/ticket/copy-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesToCopy }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to copy instructions");
      }

      setCopyResult(data);
      // Pass display names of copied files
      const addedDisplayNames = filesToCopy
        .filter((f) => data.copied.includes(f.filename))
        .map((f) => f.displayName);
      onComplete(addedDisplayNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy instructions");
    } finally {
      setCopying(false);
    }
  };

  const handleSkip = () => {
    onComplete([]);
  };

  // Don't render if not configured
  if (notConfigured) {
    return (
      <div className="instruction-selector">
        <div className="instruction-header">
          <h4>Shared Instructions</h4>
          <span className="instruction-hint">Not configured</span>
        </div>
        <div className="instruction-not-configured">
          No shared instructions repository configured. Set SHARED_INSTRUCTIONS_REPO in your environment.
        </div>
        <button className="secondary small" onClick={() => onComplete([])} disabled={disabled}>
          Continue
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="instruction-selector">
        <div className="instruction-header">
          <h4>Shared Instructions</h4>
        </div>
        <div className="instruction-loading">Loading shared instructions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="instruction-selector">
        <div className="instruction-header">
          <h4>Shared Instructions</h4>
        </div>
        <div className="instruction-error">
          <p>{error}</p>
          <div className="instruction-error-actions">
            <button className="secondary small" onClick={fetchInstructions}>
              Retry
            </button>
            <button className="secondary small" onClick={handleSkip} disabled={disabled}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (instructions.length === 0) {
    return (
      <div className="instruction-selector">
        <div className="instruction-header">
          <h4>Shared Instructions</h4>
        </div>
        <div className="instruction-empty">No instruction files found in shared repository.</div>
        <button className="secondary small" onClick={() => onComplete([])} disabled={disabled}>
          Continue
        </button>
      </div>
    );
  }

  const selectedCount = selectedFiles.size;

  const filteredInstructions = instructions.filter(
    (file) =>
      file.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="instruction-selector">
      <div className="instruction-header">
        <h4>Shared Instructions</h4>
        <span className="instruction-hint">
          Select instructions to add to this workspace
        </span>
      </div>

      <div className="instruction-search">
        <input
          type="text"
          placeholder="Search instructions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled || copying}
        />
      </div>

      <div className="instruction-list">
        {filteredInstructions.map((file) => (
          <label
            key={file.filename}
            className={`instruction-option ${file.existsInWorkspace ? "disabled" : ""} ${
              selectedFiles.has(file.filename) ? "selected" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={selectedFiles.has(file.filename) || file.existsInWorkspace}
              onChange={() => toggleSelection(file.filename)}
              disabled={file.existsInWorkspace || disabled || copying}
            />
            <div className="instruction-info">
              <span className="instruction-name">{file.displayName}</span>
              <span className="instruction-filename">{file.filename}</span>
            </div>
            {file.existsInWorkspace && (
              <span className="instruction-badge">Already in workspace</span>
            )}
          </label>
        ))}
      </div>

      {copyResult && (
        <div className="instruction-result">
          {copyResult.copied.length > 0 && (
            <span className="copied-count">{copyResult.copied.length} file(s) added</span>
          )}
          {copyResult.skipped.length > 0 && (
            <span className="skipped-count">{copyResult.skipped.length} skipped</span>
          )}
        </div>
      )}

      <div className="instruction-actions">
        <button
          className="primary small"
          onClick={handleCopyAndContinue}
          disabled={disabled || copying}
        >
          {copying
            ? "Adding..."
            : selectedCount > 0
            ? `Add ${selectedCount} & Continue`
            : "Continue"}
        </button>
        {selectedCount > 0 && (
          <button
            className="secondary small"
            onClick={handleSkip}
            disabled={disabled || copying}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
