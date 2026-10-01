import { useState, useEffect, type CSSProperties } from "react";

interface StatusEvent {
  type: "status";
  toolsInProgress: string[];
  round: number;
  message: string;
  ts: number;
}

interface StatusIndicatorProps {
  events: StatusEvent[];
  hasTextResponse: boolean;
  style?: CSSProperties;
  className?: string;
}

export function StatusIndicator({ events, hasTextResponse, style, className }: StatusIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (hasTextResponse) {
      setVisible(false);
      return;
    }
    const last = events[events.length - 1];
    if (last) {
      setMessage(last.message);
      setVisible(true);
    }
  }, [events, hasTextResponse]);

  if (!visible || !message) return null;

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#6B7280",
    ...style,
  };

  return (
    <div style={containerStyle} className={className} role="status" aria-live="polite">
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: "#3B82F6", animation: "h2a-pulse 1.5s ease-in-out infinite" }} />
      {message}
    </div>
  );
}
