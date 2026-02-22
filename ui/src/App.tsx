import { useState } from "react";
import TicketInput, { type RepoInfo } from "./components/TicketInput";
import PlanReview, { type PostTask } from "./components/PlanReview";
import Implementation from "./components/Implementation";
import ToolSelector from "./components/ToolSelector";
import CodeReviewApp from "./pages/CodeReviewApp";

type Tool = "ticket" | "review" | null;
type Step = "input" | "review" | "implement";

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

export default function App() {
  const [selectedTool, setSelectedTool] = useState<Tool>(null);
  const [step, setStep] = useState<Step>("input");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-4.5");
  const [postTasks, setPostTasks] = useState<PostTask[]>([]);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const handleTicketFetched = (fetchedTicket: Ticket) => {
    setTicket(fetchedTicket);
  };

  const handlePlanGenerated = (generatedPlan: Plan) => {
    setPlan(generatedPlan);
    setStep("review");
  };

  const handleRepoReady = (info: RepoInfo) => {
    setRepoInfo(info);
  };

  const handleApprove = (model: string, tasks: PostTask[]) => {
    setSelectedModel(model);
    setPostTasks(tasks);
    setStep("implement");
  };

  const handleCancel = () => {
    setStep("input");
    setTicket(null);
    setPlan(null);
  };

  const handleComplete = async () => {
    // Cleanup temporary instruction files
    await fetch("/api/ticket/cleanup-instructions", { method: "POST" }).catch(() => {});

    setStep("input");
    setTicket(null);
    setPlan(null);
    setRepoInfo(null);
  };

  const handleBackToSelector = () => {
    setSelectedTool(null);
    // Reset ticket state
    setStep("input");
    setTicket(null);
    setPlan(null);
    setRepoInfo(null);
  };

  // Tool selector landing page
  if (selectedTool === null) {
    return (
      <div className="container">
        <h1>Developer Tools</h1>
        <p>Select a tool to get started</p>
        <ToolSelector onSelectTool={setSelectedTool} />
      </div>
    );
  }

  // Code Review flow
  if (selectedTool === "review") {
    return (
      <div className="container">
        <CodeReviewApp onBackToSelector={handleBackToSelector} />
      </div>
    );
  }

  // Ticket Implementer flow (existing)
  return (
    <div className="container">
      <button
        className="back-to-selector"
        onClick={handleBackToSelector}
      >
        Back to Tools
      </button>

      <h1>Ticket Implementer</h1>
      <p>Paste an Azure DevOps ticket URL to generate and implement a plan</p>

      <div className="steps">
        <div
          className={`step clickable ${step === "input" ? "active" : ""} ${ticket && step !== "input" ? "completed" : ""}`}
          onClick={() => setStep("input")}
        >
          <span className="step-number">1</span>
          Enter Ticket
        </div>
        <div
          className={`step ${plan ? "clickable" : ""} ${step === "review" ? "active" : ""} ${step === "implement" ? "completed" : ""}`}
          onClick={() => plan && setStep("review")}
        >
          <span className="step-number">2</span>
          Review Plan
        </div>
        <div
          className={`step ${step === "implement" ? "active" : ""}`}
        >
          <span className="step-number">3</span>
          Implement
        </div>
      </div>

      {step === "input" && (
        <TicketInput
          onTicketFetched={handleTicketFetched}
          onPlanGenerated={handlePlanGenerated}
          onRepoReady={handleRepoReady}
          ticket={ticket}
        />
      )}

      {step === "review" && ticket && plan && (
        <PlanReview
          ticket={ticket}
          plan={plan}
          onApprove={handleApprove}
          onCancel={handleCancel}
          onPlanUpdate={setPlan}
        />
      )}

      {step === "implement" && (
        <Implementation
          onComplete={handleComplete}
          model={selectedModel}
          postTasks={postTasks}
          canCreatePr={repoInfo?.canCreatePr ?? false}
        />
      )}
    </div>
  );
}
