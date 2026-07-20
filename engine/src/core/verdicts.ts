export const VERDICTS = ["pass", "fail", "needs-human", "abstain"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const TIERS = ["tier-0", "tier-1", "tier-2"] as const;
export type Tier = (typeof TIERS)[number];

export type GateResult = {
  gate: 1 | 2 | 3 | 4;
  verdict: Verdict;
  subReason?: "no-baseline";
  evidence: Record<string, unknown>;
};

export function isVerdict(x: unknown): x is Verdict {
  return typeof x === "string" && (VERDICTS as readonly string[]).includes(x);
}
