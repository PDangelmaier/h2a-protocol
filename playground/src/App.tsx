import { useState, type CSSProperties } from "react";
import { H2AProvider, H2AChat, useH2A, usePresence, PresenceIndicator } from "@h2a/react";
import { ProtocolInspector } from "./ProtocolInspector.js";

const ENDPOINT = "http://localhost:8100";

function PlaygroundInner() {
  const h2a = useH2A();
  const presence = usePresence();

  return (
    <div style={styles.layout}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>⬡</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>H2A Playground</h1>
            <p style={{ fontSize: 12, color: "#64748b" }}>Human-to-Agent Protocol — Interactive Explorer</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PresenceIndicator state={presence.state} size={20} />
          <span style={{ fontSize: 12, color: presence.color, fontWeight: 500 }}>{presence.label}</span>
          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
            {h2a.connected ? `session:${h2a.sessionId?.slice(0, 8)}` : "disconnected"}
          </span>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.chatPane}>
          <H2AChat style={{ height: "100%" }} placeholder="Send a message (try /stream, /orchestrate, /error)" />
        </div>
        <div style={styles.inspectorPane}>
          <ProtocolInspector frames={h2a.frames} presence={presence} connected={h2a.connected} sessionId={h2a.sessionId} />
        </div>
      </main>

      <footer style={styles.footer}>
        <span>H2A Protocol v0.2 — The1ne · MIT License</span>
        <span>Requires: npx @h2a/mock-agent (port 8100)</span>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <H2AProvider endpoint={ENDPOINT}>
      <PlaygroundInner />
    </H2AProvider>
  );
}

const styles: Record<string, CSSProperties> = {
  layout: { display: "flex", flexDirection: "column", height: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #e2e8f0", backgroundColor: "white" },
  main: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, overflow: "hidden" },
  chatPane: { borderRight: "1px solid #e2e8f0", padding: 16 },
  inspectorPane: { overflow: "auto", padding: 16, backgroundColor: "#0f172a", color: "#e2e8f0" },
  footer: { display: "flex", justifyContent: "space-between", padding: "8px 24px", borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#94a3b8", backgroundColor: "white" },
};
