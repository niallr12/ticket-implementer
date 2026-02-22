import { useState } from "react";
import PRInput, { type PRMetadata } from "../components/review/PRInput";
import ReviewConfig from "../components/review/ReviewConfig";
import ReviewOutput from "../components/review/ReviewOutput";

type ReviewStep = "input" | "config" | "review";

interface ReviewSettings {
  categories: string[];
  customFocusAreas: string[];
  model: string;
}

interface CodeReviewAppProps {
  onBackToSelector: () => void;
}

export default function CodeReviewApp({ onBackToSelector }: CodeReviewAppProps) {
  const [step, setStep] = useState<ReviewStep>("input");
  const [pr, setPR] = useState<PRMetadata | null>(null);
  const [isCloned, setIsCloned] = useState(false);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings | null>(
    null
  );

  const handlePRFetched = (fetchedPR: PRMetadata) => {
    setPR(fetchedPR);
  };

  const handleCloneComplete = (_diffPreview: string) => {
    setIsCloned(true);
    setStep("config");
  };

  const handleStartReview = (config: ReviewSettings) => {
    setReviewSettings(config);
    setStep("review");
  };

  const handleComplete = async () => {
    await fetch("/api/review/reset", { method: "POST" }).catch(() => {});
    setPR(null);
    setIsCloned(false);
    setReviewSettings(null);
    setStep("input");
  };

  return (
    <>
      <button
        className="back-to-selector"
        onClick={onBackToSelector}
      >
        Back to Tools
      </button>

      <h1>Code Reviewer</h1>
      <p>Paste an Azure DevOps PR URL to get AI-powered code review feedback</p>

      <div className="steps">
        <div
          className={`step clickable ${step === "input" ? "active" : ""} ${
            pr && isCloned && step !== "input" ? "completed" : ""
          }`}
          onClick={() => setStep("input")}
        >
          <span className="step-number">1</span>
          PR Input
        </div>
        <div
          className={`step ${isCloned ? "clickable" : ""} ${
            step === "config" ? "active" : ""
          } ${step === "review" ? "completed" : ""}`}
          onClick={() => isCloned && setStep("config")}
        >
          <span className="step-number">2</span>
          Configure
        </div>
        <div
          className={`step ${step === "review" ? "active" : ""}`}
        >
          <span className="step-number">3</span>
          Review
        </div>
      </div>

      {step === "input" && (
        <PRInput
          onPRFetched={handlePRFetched}
          onCloneComplete={handleCloneComplete}
          pr={pr}
          isCloned={isCloned}
        />
      )}

      {step === "config" && (
        <ReviewConfig
          onStartReview={handleStartReview}
          onBack={() => setStep("input")}
        />
      )}

      {step === "review" && reviewSettings && (
        <ReviewOutput
          categories={reviewSettings.categories}
          customFocusAreas={reviewSettings.customFocusAreas}
          model={reviewSettings.model}
          onComplete={handleComplete}
          onBack={onBackToSelector}
        />
      )}
    </>
  );
}
