import { createContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  H2AClient,
  type H2AClientOptions,
  type AgentFrame,
  type PresenceUpdate,
  type SessionAck,
  type PresenceState,
  type UserSignal,
} from "@h2a/core";

export interface H2AContextValue {
  connected: boolean;
  sessionId: string | null;
  presence: PresenceState;
  frames: AgentFrame[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => Promise<void>;
  sendSignal: (signal: UserSignal) => Promise<void>;
  clearFrames: () => void;
}

export const H2AContext = createContext<H2AContextValue | null>(null);

interface H2AProviderProps {
  endpoint: string;
  headers?: Record<string, string>;
  autoConnect?: boolean;
  children: ReactNode;
}

export function H2AProvider({ endpoint, headers, autoConnect = false, children }: H2AProviderProps) {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceState>("rest");
  const [frames, setFrames] = useState<AgentFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<H2AClient | null>(null);

  const connect = useCallback(async () => {
    clientRef.current?.disconnect();
    setError(null);
    setFrames([]);

    const client = new H2AClient({
      endpoint,
      headers,
      onFrame: (frame: AgentFrame) => setFrames((prev) => [...prev, frame]),
      onPresence: (update: PresenceUpdate) => setPresence(update.state as PresenceState),
      onSessionAck: (ack: SessionAck) => {
        setSessionId(ack.sessionId);
        setConnected(true);
        setError(null);
      },
      onError: (err: Error) => setError(err.message),
      onDisconnect: () => setConnected(false),
    });

    clientRef.current = client;
    try {
      await client.connect({
        type: "session.open",
        hostCapabilities: {
          rendering: ["text", "tool_card", "confirmation", "progress", "toast", "error", "end"],
          conformanceLevel: "standard",
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [endpoint, headers]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setConnected(false);
    setSessionId(null);
    setPresence("rest");
    setFrames([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    await clientRef.current?.sendMessage(text);
  }, []);

  const sendSignal = useCallback(async (signal: UserSignal) => {
    await clientRef.current?.sendSignal(signal);
  }, []);

  const clearFrames = useCallback(() => setFrames([]), []);

  useEffect(() => {
    if (autoConnect) {
      const timer = setTimeout(() => { connect(); }, 0);
      return () => {
        clearTimeout(timer);
        clientRef.current?.disconnect();
        clientRef.current = null;
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <H2AContext.Provider value={{ connected, sessionId, presence, frames, error, connect, disconnect, sendMessage, sendSignal, clearFrames }}>
      {children}
    </H2AContext.Provider>
  );
}
