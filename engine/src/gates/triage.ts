import type { Tier } from "../core/verdicts";
const CMP = /(==|!=|<=|>=|<|>)/;
const signals: { name: string; test: (l: string) => boolean }[] = [
  { name: "guard/branch condition",
    test: l => (/\b(if|elif|while)\b/.test(l) && CMP.test(l)) || /\bif\b.*\belse\b/.test(l) },
  { name: "default value or constant",
    test: l => /\b[A-Z][A-Z0-9_]{2,}\s*=/.test(l) || /\w+\s*=\s*(\d+|["'])/.test(l) },
  { name: "money/quantity/unit arithmetic",
    test: l => /[A-Za-z0-9_)]\s*[*/%+\-]\s*[A-Za-z0-9_(]/.test(l) && !/["']\s*\+/.test(l) },
  { name: "public or shared contract/signature", test: l => /^\s*(def |class )/.test(l) },
  { name: "auth or permission logic", test: l => /auth|permission|role|token|login|credential/i.test(l) },
  { name: "data migration or schema change", test: l => /CREATE TABLE|ALTER TABLE|ADD COLUMN|schema/i.test(l) },
  { name: "concurrency or transaction boundary", test: l => /lock|mutex|async|await|threading|transaction|atomic/i.test(l) },
];
function changedCodeLines(diff: string): string[] {
  return diff.split("\n")
    .filter(l => (l.startsWith("+") || l.startsWith("-")) && !/^(\+\+\+|---)/.test(l))
    .map(l => l.slice(1))
    .filter(l => l.trim() !== "" && !/^\s*#/.test(l));
}
export function triage(diff: string): { tier: Tier; hits: string[] } {
  const lines = changedCodeLines(diff);
  const hits = new Set<string>();
  for (const l of lines) for (const s of signals) if (s.test(l)) hits.add(s.name);
  if (hits.size > 0) return { tier: "tier-2", hits: [...hits] };
  if (lines.length > 0) return { tier: "tier-1", hits: [] };
  return { tier: "tier-0", hits: [] };
}
