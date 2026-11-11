import { DETAIL_IDS } from "../compiler/types.ts";

export type Mode = "detail" | "compact";

/**
 * Detail rulesets when they fit. `free` is what Chrome reports after our enabled rulesets already took
 * their share, so every enabled ruleset of ours is credited back: the answer is the same whatever is
 * enabled at startup (no flip-flopping under a tight quota).
 */
export function pickMode(counts: Record<string, number>, enabled: readonly string[], free: number): Mode {
  const need = DETAIL_IDS.reduce((s, id) => s + (counts[id] ?? 0), 0);
  const room = free + enabled.reduce((s, id) => s + (counts[id] ?? 0), 0);
  return need > 0 && room >= need ? "detail" : "compact";
}
