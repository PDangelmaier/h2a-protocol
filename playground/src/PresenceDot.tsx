import type { PresenceState } from "@h2a/core";

interface Props {
  state: PresenceState;
  size?: number;
}

const BREATHE_DURATION: Record<PresenceState, string> = {
  rest: "4s",
  attentive: "2.5s",
  conversing: "1.8s",
  orchestrating: "1.2s",
};

const COLOR_VAR: Record<PresenceState, string> = {
  rest: "var(--color-presence-rest)",
  attentive: "var(--color-presence-attentive)",
  conversing: "var(--color-presence-conversing)",
  orchestrating: "var(--color-presence-orchestrating)",
};

export function PresenceDot({ state, size = 10 }: Props) {
  const color = COLOR_VAR[state];
  const duration = BREATHE_DURATION[state];

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size * 2, height: size * 2 }}
      role="status"
      aria-label={`Agent: ${state}`}
    >
      <span
        className="absolute rounded-full presence-breathe"
        style={{
          width: size * 2,
          height: size * 2,
          backgroundColor: color,
          "--breathe-duration": duration,
        } as React.CSSProperties}
      />
      <span
        className="relative rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  );
}
