import { useMemo } from "react";
import type { AgentFrame, FrameType } from "@h2a/core";
import { useH2A } from "./useH2A.js";

export interface UseFramesOptions {
  filter?: FrameType[];
}

export function useFrames(options?: UseFramesOptions): AgentFrame[] {
  const { frames } = useH2A();
  const filterSet = useMemo(
    () => options?.filter ? new Set(options.filter) : null,
    [options?.filter],
  );

  return useMemo(
    () => filterSet ? frames.filter((f) => filterSet.has(f.frameType as FrameType)) : frames,
    [frames, filterSet],
  );
}
