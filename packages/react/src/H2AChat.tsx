import { useState, useRef, useCallback, useEffect, type CSSProperties } from "react";
import type { AgentFrame } from "@h2a/core";
import { useH2A } from "./useH2A.js";
import { PresenceIndicator } from "./PresenceIndicator.js";

interface H2AChatProps {
  style?: CSSProperties;
  className?: string;
  placeholder?: string;
}

function frameText(frame: AgentFrame): string {
  const c = frame.content as Record<string, unknown>;
  switch (frame.frameType) {
    case "text": return (c.text as string) ?? "";
    case "tool_card": return `[Tool: ${c.tool}] ${c.status}`;
    case "progress": return `${c.task}: ${c.percent}%`;
    case "confirmation": return `${c.action}: ${c.description}`;
    case "toast": return String(c.message ?? "");
    case "error": return `Error: ${c.message}`;
    case "end": return "";
    default: return JSON.stringify(c);
  }
}

export function H2AChat({ style, className, placeholder = "Type a message..." }: H2AChatProps) {
  const { connected, presence, frames, error, connect, sendMessage } = useH2A();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [frames]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !connected) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  }, [input, connected, sendMessage]);

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    fontFamily: "system-ui, sans-serif",
    ...style,
  };

  return (
    <div style={containerStyle} className={className}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <PresenceIndicator state={presence} size={24} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>H2A Agent</span>
        {connected && <span style={{ marginLeft: "auto", fontSize: 10, color: "#10B981" }}>Connected</span>}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 16 }} role="log" aria-live="polite">
        {frames.map((frame, i) => {
          const text = frameText(frame);
          if (!text) return null;
          return (
            <div key={`${frame.id}-${i}`} style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: frame.frameType === "error" ? "#FEE2E2" : "#F3F4F6", fontSize: 14 }}>
              <span style={{ fontSize: 10, color: "#9CA3AF", marginRight: 8 }}>{frame.frameType}</span>
              {text}
            </div>
          );
        })}
        {error && <div style={{ padding: "8px 12px", borderRadius: 8, backgroundColor: "#FEE2E2", fontSize: 12, color: "#DC2626" }}>{error}</div>}
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb" }}>
        {!connected ? (
          <button onClick={() => connect()} style={{ width: "100%", padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: "#3B82F6", color: "white", cursor: "pointer", fontSize: 14 }}>
            Connect to Agent
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={placeholder}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", outline: "none", fontSize: 14 }}
            />
            <button onClick={handleSend} disabled={!input.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: "#3B82F6", color: "white", cursor: "pointer", fontSize: 14, opacity: input.trim() ? 1 : 0.5 }}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
