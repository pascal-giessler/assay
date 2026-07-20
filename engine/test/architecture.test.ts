import { describe, it, expect } from "vitest";
import { architectureGate } from "../src/gates/architecture";
describe("architectureGate", () => {
  it("abstains with no-baseline", () => {
    const r = architectureGate();
    expect(r.gate).toBe(2);
    expect(r.verdict).toBe("abstain");
    expect(r.subReason).toBe("no-baseline");
  });
});
