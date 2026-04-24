import { useContext } from "react";
import { H2AContext, type H2AContextValue } from "./H2AProvider.js";

export function useH2A(): H2AContextValue {
  const ctx = useContext(H2AContext);
  if (!ctx) throw new Error("useH2A must be used within <H2AProvider>");
  return ctx;
}
