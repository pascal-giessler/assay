import { describe, it, expect } from "vitest";
import { isVerdict, VERDICTS, TIERS } from "../src/core/verdicts";

describe("verdicts", () => {
  it("accepts the four exact verdicts and rejects others", () => {
    expect(VERDICTS).toEqual(["pass", "fail", "needs-human", "abstain"]);
    expect(isVerdict("needs-human")).toBe(true);
    expect(isVerdict("approved")).toBe(false);
  });
  it("defines the three tiers", () => {
    expect(TIERS).toEqual(["tier-0", "tier-1", "tier-2"]);
  });
});
