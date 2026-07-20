import { describe, it, expect } from "vitest";
import { loadChangeset } from "../src/core/changeset";
describe("loadChangeset", () => {
  const fakeDiff = async () => "diff --git a/x b/x\n+changed";
  it("is spec mode when a non-empty requirement is given", async () => {
    const c = await loadChangeset(
      { range: "A..B", workdir: "/repo", testCmd: "pytest", requirement: "do X" },
      fakeDiff);
    expect(c.mode).toBe("spec");
    expect(c.diff).toContain("changed");
  });
  it("is inference mode when requirement is null/empty", async () => {
    const c = await loadChangeset(
      { range: "A..B", workdir: "/repo", testCmd: "pytest", requirement: null },
      fakeDiff);
    expect(c.mode).toBe("inference");
  });
});
