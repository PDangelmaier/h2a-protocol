import { H2AProvider, useH2A, usePresence } from "@h2a/react";
import { Hexagon, Wifi, WifiOff, Sparkles } from "lucide-react";
import { ChatPane } from "./ChatPane.js";
import { ProtocolInspector } from "./ProtocolInspector.js";
import { PresenceDot } from "./PresenceDot.js";

const ENDPOINT = "http://localhost:8100";

function PlaygroundInner() {
  const h2a = useH2A();
  const presence = usePresence();

  return (
    <div className="flex flex-col h-screen bg-surface text-text-primary">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-sidebar">
        <div className="flex items-center gap-3">
          <Hexagon className="w-6 h-6 text-accent" strokeWidth={1.5} />
          <div>
            <h1 className="text-sm font-semibold tracking-tight">H2A Playground</h1>
            <p className="text-xs text-text-muted">Human-to-Agent Protocol Explorer</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <PresenceDot state={presence.state} size={10} />
            <span className="text-xs font-medium" style={{ color: presence.color }}>
              {presence.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
            {h2a.connected ? (
              <>
                <Wifi className="w-3 h-3 text-success" />
                <span>{h2a.sessionId?.slice(0, 12)}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-error" />
                <span>disconnected</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-dim text-accent text-xs font-medium">
            <Sparkles className="w-3 h-3" />
            <span>v0.2</span>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[1fr_400px] overflow-hidden">
        <ChatPane />
        <ProtocolInspector
          frames={h2a.frames}
          presence={presence}
          connected={h2a.connected}
          sessionId={h2a.sessionId}
        />
      </main>

      <footer className="flex items-center justify-between px-6 py-2 border-t border-border text-[11px] text-text-muted bg-surface-sidebar">
        <span>H2A Protocol v0.2 — The1ne &middot; MIT License</span>
        <span>Mock Agent: localhost:8100</span>
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
