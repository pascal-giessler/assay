import { describe, it, expect } from "vitest";
import { triage } from "../src/gates/triage";
const wrap = (added: string) => `diff --git a/f.py b/f.py\n--- a/f.py\n+++ b/f.py\n@@\n+${added}`;
describe("triage", () => {
  it("Tier 0 for whitespace-only", () => {
    expect(triage(`diff --git a/f.py b/f.py\n@@\n+    \n-\t`).tier).toBe("tier-0");
  });
  it("Tier 1 for feature code touching no blast-radius item", () => {
    expect(triage(wrap(`return render(template, items)`)).tier).toBe("tier-1");
  });
  it("Tier 2 for a discount cap constant + arithmetic change", () => {
    const r = triage(wrap(`capped = percent if percent <= 50 else 50`));
    expect(r.tier).toBe("tier-2");
    expect(r.hits).toContain("guard/branch condition");
  });
  it("Tier 2 for money arithmetic", () => {
    expect(triage(wrap(`return round(price * (1 - capped / 100), 2)`)).tier).toBe("tier-2");
  });
});
