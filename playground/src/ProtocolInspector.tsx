import type { CSSProperties } from "react";
import type { AgentFrame } from "@h2a/core";
import type { PresenceInfo } from "@h2a/react";

interface Props {
  frames: AgentFrame[];
  presence: PresenceInfo;
  connected: boolean;
  sessionId: string | null;
}

const FRAME_COLORS: Record<string, string> = {
  text: "#22c55e",
  tool_card: "#a855f7",
  progress: "#f97316",
  confirmation: "#eab308",
  toast: "#06b6d4",
  error: "#ef4444",
  end: "#6b7280",
};

export function ProtocolInspector({ frames, presence, connected, sessionId }: Props) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 12 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#94a3b8" }}>Protocol Inspector</h2>

      <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, backgroundColor: "#1e293b" }}>
        <div style={row}>
          <span style={label}>status</span>
          <span style={{ color: connected ? "#22c55e" : "#ef4444" }}>{connected ? "connected" : "disconnected"}</span>
        </div>
        <div style={row}>
          <span style={label}>session</span>
          <span style={{ color: "#e2e8f0" }}>{sessionId ?? "—"}</span>
        </div>
        <div style={row}>
          <span style={label}>presence</span>
          <span style={{ color: presence.color }}>{presence.state}</span>
        </div>
        <div style={row}>
          <span style={label}>frames</span>
          <span style={{ color: "#e2e8f0" }}>{frames.length}</span>
        </div>
      </div>

      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#64748b" }}>Frame Log</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {frames.map((frame, i) => (
          <div key={`${frame.id}-${i}`} style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "#1e293b", borderLeft: `3px solid ${FRAME_COLORS[frame.frameType] ?? "#64748b"}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
              <span style={{ color: FRAME_COLORS[frame.frameType] ?? "#64748b", fontWeight: 600 }}>{frame.frameType}</span>
              <span style={{ color: "#475569" }}>seq:{frame.sequence}</span>
              <span style={{ color: "#475569" }}>id:{frame.id.slice(0, 12)}</span>
              {frame.streaming && <span style={{ color: "#f97316" }}>streaming</span>}
              {frame.final && <span style={{ color: "#22c55e" }}>final</span>}
            </div>
            <pre style={{ color: "#94a3b8", fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(frame.content, null, 2)}
            </pre>
          </div>
        ))}
        {frames.length === 0 && (
          <div style={{ color: "#475569", fontStyle: "italic" }}>No frames yet. Connect and send a message.</div>
        )}
      </div>
    </div>
  );
}

const row: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "2px 0" };
const label: CSSProperties = { color: "#64748b" };
