interface ToolSelectorProps {
  onSelectTool: (tool: "ticket" | "review") => void;
}

export default function ToolSelector({ onSelectTool }: ToolSelectorProps) {
  return (
    <div className="tool-selector">
      <div
        className="tool-card"
        onClick={() => onSelectTool("ticket")}
      >
        <div className="tool-card-icon">T</div>
        <h3>Ticket Implementer</h3>
        <p>
          Paste an Azure DevOps ticket URL to generate an implementation plan
          and have AI write the code for you.
        </p>
        <button className="primary">Get Started</button>
      </div>

      <div
        className="tool-card"
        onClick={() => onSelectTool("review")}
      >
        <div className="tool-card-icon">R</div>
        <h3>Code Reviewer</h3>
        <p>
          Paste an Azure DevOps PR link to get AI-powered code review feedback
          with configurable review categories.
        </p>
        <button className="primary">Get Started</button>
      </div>
    </div>
  );
}
