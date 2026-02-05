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

interface DiscussionMessage {
  role: "user" | "assistant";
  content: string;
}

const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4.5", name: "Claude 4.5 Sonnet", description: "Anthropic's balanced model" },
  { id: "claude-opus-4.5", name: "Claude 4.5 Opus", description: "Anthropic's most capable model" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "OpenAI's flagship model" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Google's advanced model" },
];

const POST_IMPLEMENTATION_TASKS = [
  { id: "test", name: "Run Tests", command: "npm test", description: "Run the test suite" },
  { id: "build", name: "Build Project", command: "npm run build", description: "Verify the project builds" },
  { id: "lint", name: "Run Linter", command: "npm run lint", description: "Check for code style issues" },
  { id: "typecheck", name: "Type Check", command: "npm run typecheck", description: "Verify TypeScript types" },
];

export interface PostTask {
  id: string;
  name: string;
  command: string;
}

interface Props {
  ticket: Ticket;
  plan: Plan;
  onApprove: (model: string, postTasks: PostTask[]) => void;
  onCancel: () => void;
  onPlanUpdate: (plan: Plan) => void;
}

export default function PlanReview({ ticket, plan, onApprove, onCancel, onPlanUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPlan, setEditedPlan] = useState(plan.implementationPlan);
  const [feedback, setFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState("");
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4.5");
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [customCommand, setCustomCommand] = useState("");
  const [discussionMessages, setDiscussionMessages] = useState<DiscussionMessage[]>([]);
  const [discussionQuestion, setDiscussionQuestion] = useState("");
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);

  const toggleTask = (taskId: string) => {
    const newTasks = new Set(selectedTasks);
    if (newTasks.has(taskId)) {
      newTasks.delete(taskId);
    } else {
      newTasks.add(taskId);
    }
    setSelectedTasks(newTasks);
  };

  const getSelectedPostTasks = (): PostTask[] => {
    const tasks: PostTask[] = [];
    for (const task of POST_IMPLEMENTATION_TASKS) {
      if (selectedTasks.has(task.id)) {
        tasks.push({ id: task.id, name: task.name, command: task.command });
      }
    }
    if (customCommand.trim()) {
      tasks.push({ id: "custom", name: "Custom Command", command: customCommand.trim() });
    }
    return tasks;
  };

  const handleSaveEdit = async () => {
    try {
      const response = await fetch("/api/ticket/update-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationPlan: editedPlan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update plan");
      }

      onPlanUpdate(data.plan);
      setIsEditing(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    }
  };

  const handleCancelEdit = () => {
    setEditedPlan(plan.implementationPlan);
    setIsEditing(false);
  };

  const handleRefine = async () => {
    if (!feedback.trim()) {
      setError("Please enter feedback to refine the plan");
      return;
    }

    setIsRefining(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to refine plan");
      }

      onPlanUpdate(data.plan);
      setEditedPlan(data.plan.implementationPlan);
      setFeedback("");
      // Clear discussion when plan changes
      setDiscussionMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refine plan");
    } finally {
      setIsRefining(false);
    }
  };

  const handleDiscuss = async () => {
    if (!discussionQuestion.trim()) {
      return;
    }

    setIsDiscussing(true);
    setError("");

    try {
      const response = await fetch("/api/ticket/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: discussionQuestion }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      setDiscussionMessages(data.history);
      setDiscussionQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discuss plan");
    } finally {
      setIsDiscussing(false);
    }
  };

  const handleClearDiscussion = async () => {
    try {
      await fetch("/api/ticket/clear-discussion", { method: "POST" });
      setDiscussionMessages([]);
    } catch {
      // Ignore errors
    }
  };

  return (
    <div className="card">
      <div className="ticket-info">
        <h3>{ticket.title}</h3>
        <div className="ticket-meta">
          <span>{ticket.type}</span>
          <span>{ticket.state}</span>
        </div>
      </div>

      <div className="plan-section">
        <h4>Summary</h4>
        <div className="plan-content">{plan.summary}</div>
      </div>

      <div className="plan-section">
        <div className="plan-header">
          <h4>Implementation Plan</h4>
          {!isEditing && (
            <button
              className="edit-toggle"
              onClick={() => setIsEditing(true)}
              title="Edit plan directly"
            >
              ✏️ Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="plan-edit-container">
            <textarea
              className="plan-textarea"
              value={editedPlan}
              onChange={(e) => setEditedPlan(e.target.value)}
              rows={12}
            />
            <div className="edit-actions">
              <button className="primary small" onClick={handleSaveEdit}>
                Save Changes
              </button>
              <button className="secondary small" onClick={handleCancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="plan-content">{plan.implementationPlan}</div>
        )}
      </div>

      <div className="discuss-section">
        <div className="discuss-header">
          <h4>Discuss Plan</h4>
          <button
            className="discuss-toggle"
            onClick={() => setShowDiscussion(!showDiscussion)}
          >
            {showDiscussion ? "Hide" : "Show"} Discussion
          </button>
        </div>

        {showDiscussion && (
          <>
            <p className="discuss-hint">
              Ask questions about the plan - why certain decisions were made, clarify implementation details, or explore alternatives.
            </p>

            {discussionMessages.length > 0 && (
              <div className="discussion-messages">
                {discussionMessages.map((msg, index) => (
                  <div key={index} className={`discussion-message ${msg.role}`}>
                    <span className="message-role">{msg.role === "user" ? "You" : "AI"}</span>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="discuss-input-group">
              <input
                type="text"
                className="discuss-input"
                value={discussionQuestion}
                onChange={(e) => setDiscussionQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isDiscussing && handleDiscuss()}
                placeholder="e.g., Why are we modifying the UserService component?"
                disabled={isDiscussing}
              />
              <button
                className="discuss-button"
                onClick={handleDiscuss}
                disabled={isDiscussing || !discussionQuestion.trim()}
              >
                {isDiscussing ? "..." : "Ask"}
              </button>
            </div>

            {discussionMessages.length > 0 && (
              <button
                className="clear-discussion"
                onClick={handleClearDiscussion}
              >
                Clear Discussion
              </button>
            )}
          </>
        )}
      </div>

      <div className="refine-section">
        <h4>Refine Plan</h4>
        <p className="refine-hint">
          Not happy with the plan? Provide feedback and let AI refine it.
        </p>
        <div className="refine-input-group">
          <textarea
            className="refine-textarea"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g., Add error handling, use a different approach for the database layer, include unit tests..."
            rows={3}
            disabled={isRefining}
          />
          <button
            className="refine-button"
            onClick={handleRefine}
            disabled={isRefining || !feedback.trim()}
          >
            {isRefining ? "Refining..." : "Refine Plan"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="model-selector">
        <h4>Select Model for Implementation</h4>
        <div className="model-options">
          {AVAILABLE_MODELS.map((model) => (
            <label
              key={model.id}
              className={`model-option ${selectedModel === model.id ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="model"
                value={model.id}
                checked={selectedModel === model.id}
                onChange={(e) => setSelectedModel(e.target.value)}
              />
              <div className="model-info">
                <span className="model-name">{model.name}</span>
                <span className="model-description">{model.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="post-tasks-section">
        <h4>Post-Implementation Tasks</h4>
        <p className="post-tasks-hint">
          Select tasks to run after implementation, before creating the PR.
        </p>
        <div className="post-tasks-options">
          {POST_IMPLEMENTATION_TASKS.map((task) => (
            <label
              key={task.id}
              className={`post-task-option ${selectedTasks.has(task.id) ? "selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={selectedTasks.has(task.id)}
                onChange={() => toggleTask(task.id)}
              />
              <div className="post-task-info">
                <span className="post-task-name">{task.name}</span>
                <span className="post-task-command">{task.command}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="custom-command">
          <label htmlFor="custom-cmd">Custom command (optional)</label>
          <input
            id="custom-cmd"
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="e.g., npm run e2e, ./scripts/validate.sh"
          />
        </div>
      </div>

      <div className="button-group">
        <button className="primary" onClick={() => onApprove(selectedModel, getSelectedPostTasks())}>
          Approve & Implement
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
