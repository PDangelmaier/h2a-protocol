import type { CSSProperties } from "react";
import type { PresenceState } from "@h2a/core";

interface PresenceIndicatorProps {
  state: PresenceState;
  size?: number;
  className?: string;
  reducedMotion?: boolean;
}

const PRESENCE_STYLES: Record<PresenceState, { color: string; duration: string }> = {
  rest: { color: "#6B7280", duration: "4s" },
  attentive: { color: "#3B82F6", duration: "2.5s" },
  conversing: { color: "#10B981", duration: "1.8s" },
  orchestrating: { color: "#8B5CF6", duration: "1.2s" },
};

export function PresenceIndicator({ state, size = 24, className, reducedMotion = false }: PresenceIndicatorProps) {
  const config = PRESENCE_STYLES[state];
  const r = size / 2;

  const outerStyle: CSSProperties = {
    position: "relative",
    width: size,
    height: size,
    display: "inline-block",
  };

  const pulseStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    backgroundColor: config.color,
    opacity: 0.2,
    animation: reducedMotion ? "none" : `h2a-breathe ${config.duration} ease-in-out infinite`,
  };

  const coreStyle: CSSProperties = {
    position: "absolute",
    width: r,
    height: r,
    top: r / 2,
    left: r / 2,
    borderRadius: "50%",
    backgroundColor: config.color,
  };

  return (
    <>
      <style>{`@keyframes h2a-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }`}</style>
      <span style={outerStyle} className={className} role="status" aria-label={`Agent presence: ${state}`}>
        <span style={pulseStyle} />
        <span style={coreStyle} />
      </span>
    </>
  );
}
