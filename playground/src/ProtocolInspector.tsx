import type { AgentFrame } from "@h2a/core";
import type { PresenceInfo } from "@h2a/react";
import { Activity, Radio, Hash, Layers, ChevronRight } from "lucide-react";

interface Props {
  frames: AgentFrame[];
  presence: PresenceInfo;
  connected: boolean;
  sessionId: string | null;
}

const FRAME_COLORS: Record<string, string> = {
  text: "var(--color-frame-text)",
  tool_card: "var(--color-frame-tool)",
  progress: "var(--color-frame-progress)",
  confirmation: "var(--color-frame-confirmation)",
  toast: "var(--color-frame-toast)",
  error: "var(--color-frame-error)",
  end: "var(--color-frame-end)",
  artifact: "var(--color-frame-artifact)",
};

export function ProtocolInspector({ frames, presence, connected, sessionId }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-code border-l border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-sidebar">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
          <Activity className="w-3.5 h-3.5" />
          Protocol Inspector
        </div>
      </div>

      {/* Status Panel */}
      <div className="px-4 py-3 border-b border-border-subtle space-y-1.5 font-mono text-xs">
        <StatusRow icon={<Radio className="w-3 h-3" />} label="status" value={connected ? "connected" : "disconnected"} valueColor={connected ? "var(--color-success)" : "var(--color-error)"} />
        <StatusRow icon={<Hash className="w-3 h-3" />} label="session" value={sessionId ?? "—"} />
        <StatusRow icon={<Activity className="w-3 h-3" />} label="presence" value={presence.state} valueColor={presence.color} />
        <StatusRow icon={<Layers className="w-3 h-3" />} label="frames" value={String(frames.length)} />
      </div>

      {/* Frame Log */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 px-1">
          Frame Log
        </div>
        {frames.length === 0 && (
          <div className="text-xs text-text-muted italic px-1">No frames yet. Connect and send a message.</div>
        )}
        {frames.map((frame, i) => (
          <FrameEntry key={`${frame.id}-${i}`} frame={frame} />
        ))}
      </div>
    </div>
  );
}

function StatusRow({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between text-text-muted">
      <div className="flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-text-primary truncate max-w-[200px]" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

function FrameEntry({ frame }: { frame: AgentFrame }) {
  const color = FRAME_COLORS[frame.frameType] ?? "var(--color-frame-end)";

  return (
    <div
      className="px-2.5 py-2 rounded-md bg-surface-raised animate-fade-in"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] mb-1">
        <ChevronRight className="w-2.5 h-2.5" style={{ color }} />
        <span className="font-semibold" style={{ color }}>{frame.frameType}</span>
        <span className="text-text-muted">seq:{frame.sequence}</span>
        <span className="text-text-muted truncate max-w-[80px]">id:{frame.id.slice(0, 10)}</span>
        {frame.streaming && <span className="text-frame-progress font-medium">stream</span>}
        {frame.final && <span className="text-frame-text font-medium">final</span>}
      </div>
      <pre className="text-[10px] text-text-muted whitespace-pre-wrap break-all leading-relaxed">
        {JSON.stringify(frame.content, null, 2)}
      </pre>
    </div>
  );
}
