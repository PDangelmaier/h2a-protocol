import { useState, useRef, useCallback, useEffect } from "react";
import { useH2A, usePresence } from "@h2a/react";
import type { AgentFrame } from "@h2a/core";
import { Send, Plug, Wrench, AlertTriangle, CheckCircle2, Bell, FileDown, Loader2 } from "lucide-react";
import { PresenceDot } from "./PresenceDot.js";

interface MergedFrame {
  id: string;
  frameType: string;
  content: Record<string, unknown>;
  streaming?: boolean;
  final?: boolean;
}

function mergeFrames(frames: AgentFrame[]): MergedFrame[] {
  const result: MergedFrame[] = [];
  for (const frame of frames) {
    const last = result[result.length - 1];
    if (last && last.id === frame.id) {
      if (frame.frameType === "text") {
        const prev = (last.content.text as string) ?? "";
        const next = ((frame.content as Record<string, unknown>).text as string) ?? "";
        last.content = { ...last.content, text: prev + next };
        last.streaming = frame.streaming;
        last.final = frame.final;
        continue;
      }
      if (frame.frameType === "progress" || frame.frameType === "tool_card") {
        last.content = frame.content as Record<string, unknown>;
        last.streaming = frame.streaming;
        last.final = frame.final;
        continue;
      }
    }
    result.push({
      id: frame.id,
      frameType: frame.frameType,
      content: frame.content as Record<string, unknown>,
      streaming: frame.streaming,
      final: frame.final,
    });
  }
  return result;
}

export function ChatPane() {
  const { connected, frames, error, connect, sendMessage } = useH2A();
  const presence = usePresence();
  const [input, setInput] = useState("");
  const [userMessages, setUserMessages] = useState<{ id: number; text: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [frames, userMessages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !connected) return;
    const text = input;
    setInput("");
    msgCounter.current += 1;
    setUserMessages((prev) => [...prev, { id: msgCounter.current, text }]);
    await sendMessage(text);
  }, [input, connected, sendMessage]);

  const merged = mergeFrames(frames);
  const timeline = buildTimeline(userMessages, merged);

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-border">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface-sidebar">
        <PresenceDot state={presence.state} size={8} />
        <span className="text-sm font-semibold">H2A Agent</span>
        {connected && (
          <span className="ml-auto text-[10px] text-success font-medium uppercase tracking-wider">Live</span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3" role="log" aria-live="polite">
        {!connected && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
            <Plug className="w-8 h-8 text-accent opacity-40" />
            <p className="text-sm">Connect to start interacting</p>
            <button
              onClick={() => connect()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Connect to Agent
            </button>
          </div>
        )}

        {connected && timeline.map((item, i) => {
          if (item.type === "user") {
            return (
              <div key={`u-${item.userMsg.id}`} className="flex justify-end animate-fade-in">
                <div className="max-w-[80%] px-4 py-2.5 rounded-xl bg-bubble-user text-sm leading-relaxed">
                  {item.userMsg.text}
                </div>
              </div>
            );
          }

          return <FrameBubble key={`m-${item.frame.id}-${i}`} frame={item.frame} />;
        })}

        {error && (
          <div className="px-4 py-2 rounded-lg bg-red-950/30 border border-error/20 text-error text-sm animate-fade-in">
            {error}
          </div>
        )}
      </div>

      {connected && (
        <div className="px-5 py-3 border-t border-border">
          <div className="orbit-border">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Send a message (try /stream, /orchestrate, /error, /config)"
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-1.5 rounded-md text-accent hover:bg-accent-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FrameBubble({ frame }: { frame: MergedFrame }) {
  const c = frame.content;
  if (frame.frameType === "end") return null;

  const isError = frame.frameType === "error";
  const isStreaming = frame.streaming && !frame.final;
  const base = isError ? "bg-red-950/30 border border-error/20" : "bg-bubble-agent";

  const icon = frameIcon(frame.frameType);
  const showLabel = frame.frameType !== "text";

  return (
    <div className="flex justify-start animate-fade-in">
      <div className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${base}`}>
        {showLabel && icon && (
          <div className="flex items-center gap-2 mb-1.5 text-xs text-text-muted">
            {icon}
            <span className="uppercase tracking-wider font-medium">{frame.frameType.replace("_", " ")}</span>
          </div>
        )}

        {frame.frameType === "text" && (
          <span className={isStreaming ? "streaming-cursor" : ""}>{c.text as string}</span>
        )}

        {frame.frameType === "tool_card" && (
          <span>{c.tool as string} — <span className={c.status === "completed" ? "text-success" : "text-text-secondary"}>{c.status as string}</span></span>
        )}

        {frame.frameType === "progress" && (
          <>
            <span>{c.task as string}: {c.percent as number}%</span>
            <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-frame-progress transition-all duration-300" style={{ width: `${c.percent}%` }} />
            </div>
          </>
        )}

        {frame.frameType === "confirmation" && (
          <>
            <span>{c.description as string}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {(c.options as { id: string; label: string }[])?.map((opt) => (
                <button key={opt.id} className="px-3 py-1 text-xs font-medium rounded-md bg-accent-dim text-accent hover:bg-accent/20 transition-colors">
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {frame.frameType === "toast" && <span>{c.message as string}</span>}
        {frame.frameType === "error" && <span>{c.message as string}</span>}
        {frame.frameType === "artifact" && <span>{(c.filename as string) ?? "artifact"}</span>}
      </div>
    </div>
  );
}

function frameIcon(type: string): React.ReactNode {
  switch (type) {
    case "tool_card": return <Wrench className="w-3.5 h-3.5 text-frame-tool" />;
    case "progress": return <Loader2 className="w-3.5 h-3.5 text-frame-progress animate-spin" />;
    case "confirmation": return <CheckCircle2 className="w-3.5 h-3.5 text-frame-confirmation" />;
    case "toast": return <Bell className="w-3.5 h-3.5 text-frame-toast" />;
    case "error": return <AlertTriangle className="w-3.5 h-3.5 text-frame-error" />;
    case "artifact": return <FileDown className="w-3.5 h-3.5 text-frame-artifact" />;
    default: return null;
  }
}

type TimelineItem =
  | { type: "user"; userMsg: { id: number; text: string } }
  | { type: "frame"; frame: MergedFrame };

function buildTimeline(userMsgs: { id: number; text: string }[], frames: MergedFrame[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let fi = 0;
  let ui = 0;

  while (ui < userMsgs.length) {
    items.push({ type: "user", userMsg: userMsgs[ui] });
    ui++;
    const nextUser = ui < userMsgs.length;

    while (fi < frames.length) {
      items.push({ type: "frame", frame: frames[fi] });
      const isEnd = frames[fi].frameType === "end";
      fi++;
      if (nextUser && isEnd) break;
    }
  }

  while (fi < frames.length) {
    items.push({ type: "frame", frame: frames[fi] });
    fi++;
  }

  return items;
}
