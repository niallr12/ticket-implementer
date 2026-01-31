import React from "react";
import "../index.css";

interface CoolButtonProps {
  label: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CoolButton({ label, onClick, style }: CoolButtonProps) {
  return (
    <button className="cool-button" onClick={onClick} style={style}>
      <span className="cool-button-glow" />
      <span className="cool-button-icon" role="img" aria-label="sparkles">✨</span>
      <span className="cool-button-label">{label}</span>
    </button>
  );
}
