import { useState, useEffect } from "react";

interface ReviewCategory {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

interface ReviewConfigProps {
  onStartReview: (config: {
    categories: string[];
    customFocusAreas: string[];
    model: string;
  }) => void;
  onBack: () => void;
}

const MODELS = [
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Fast, capable code reviewer",
  },
  {
    id: "gpt-4.1",
    name: "GPT 4.1",
    description: "Strong reasoning and analysis",
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    description: "Most thorough, slower",
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    description: "Fast and cost-effective",
  },
];

export default function ReviewConfig({ onStartReview, onBack }: ReviewConfigProps) {
  const [categories, setCategories] = useState<ReviewCategory[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(
    new Set()
  );
  const [customFocusAreas, setCustomFocusAreas] = useState<string[]>([]);
  const [newFocusArea, setNewFocusArea] = useState("");
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4.5");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/review/categories")
      .then((res) => res.json())
      .then((data) => {
        setCategories(data.categories);
        const defaults = new Set<string>(
          data.categories
            .filter((c: ReviewCategory) => c.defaultEnabled)
            .map((c: ReviewCategory) => c.id)
        );
        setEnabledCategories(defaults);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleCategory = (id: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addFocusArea = () => {
    const trimmed = newFocusArea.trim();
    if (trimmed && !customFocusAreas.includes(trimmed)) {
      setCustomFocusAreas((prev) => [...prev, trimmed]);
      setNewFocusArea("");
    }
  };

  const removeFocusArea = (index: number) => {
    setCustomFocusAreas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFocusArea();
    }
  };

  const handleStart = () => {
    onStartReview({
      categories: Array.from(enabledCategories),
      customFocusAreas,
      model: selectedModel,
    });
  };

  if (loading) {
    return <div className="card">Loading categories...</div>;
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1.5rem" }}>Configure Review</h3>

      {/* Review Categories */}
      <div className="review-categories">
        <h4 style={{ marginBottom: "0.5rem" }}>Review Categories</h4>
        <p className="refine-hint">
          Toggle categories to include in the review
        </p>
        <div className="category-grid">
          {categories.map((cat) => (
            <label
              key={cat.id}
              className={`category-toggle ${
                enabledCategories.has(cat.id) ? "enabled" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={enabledCategories.has(cat.id)}
                onChange={() => toggleCategory(cat.id)}
              />
              <div className="category-info">
                <span className="category-name">{cat.name}</span>
                <span className="category-desc">{cat.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Custom Focus Areas */}
      <div className="custom-focus-section">
        <h4 style={{ marginBottom: "0.5rem" }}>Custom Focus Areas</h4>
        <p className="refine-hint">
          Add specific concerns for the reviewer to check
        </p>

        {customFocusAreas.length > 0 && (
          <div className="focus-area-list">
            {customFocusAreas.map((area, i) => (
              <div key={i} className="focus-area-pill">
                <span>{area}</span>
                <button
                  className="focus-area-remove"
                  onClick={() => removeFocusArea(i)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="discuss-input-group">
          <input
            type="text"
            className="discuss-input"
            value={newFocusArea}
            onChange={(e) => setNewFocusArea(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="e.g., Check for proper use of our logging framework"
          />
          <button
            className="discuss-button"
            onClick={addFocusArea}
            disabled={!newFocusArea.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="model-selector">
        <h4>Model for Review</h4>
        <div className="model-options">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className={`model-option ${
                selectedModel === m.id ? "selected" : ""
              }`}
            >
              <input
                type="radio"
                name="review-model"
                value={m.id}
                checked={selectedModel === m.id}
                onChange={() => setSelectedModel(m.id)}
              />
              <div className="model-info">
                <span className="model-name">{m.name}</span>
                <span className="model-description">{m.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="button-group">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
        <button
          className="cool-button"
          onClick={handleStart}
          disabled={enabledCategories.size === 0}
        >
          <span className="cool-button-label">Start Review</span>
        </button>
      </div>
    </div>
  );
}
