import { useMemo } from "react";
import type { PresenceState } from "@h2a/core";
import { useH2A } from "./useH2A.js";

export interface PresenceInfo {
  state: PresenceState;
  label: string;
  isActive: boolean;
  breatheDuration: number;
  color: string;
}

const PRESENCE_META: Record<PresenceState, Omit<PresenceInfo, "state">> = {
  rest: { label: "Resting", isActive: false, breatheDuration: 4, color: "#6B7280" },
  attentive: { label: "Attentive", isActive: true, breatheDuration: 2.5, color: "#3B82F6" },
  conversing: { label: "Conversing", isActive: true, breatheDuration: 1.8, color: "#10B981" },
  orchestrating: { label: "Orchestrating", isActive: true, breatheDuration: 1.2, color: "#8B5CF6" },
};

export function usePresence(): PresenceInfo {
  const { presence } = useH2A();
  return useMemo(() => ({ state: presence, ...PRESENCE_META[presence] }), [presence]);
}
