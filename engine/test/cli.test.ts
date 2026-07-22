import { describe, it, expect } from "vitest";
import { buildProgram } from "../src/cli/index";
describe("review CLI", () => {
  it("runs a review through injected deps and writes markdown", async () => {
    let written = "";
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async (_ctx, _lang) => ({ tier: "tier-2", gates: [], markdown: "# artifact\n- verdict: needs-human", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "needs-human" }, gates: [], flow: null, synthesis: { verdict: "needs-human", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: (path, content) => { written = content; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--spec", "s", "--workdir", "/w"]);
    expect(written).toContain("# artifact");
  });
  it("writes the ReviewDocument as JSON when --format json", async () => {
    let written = "";
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "# a", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "pass" }, gates: [], flow: null, synthesis: { verdict: "pass", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: (_p, c) => { written = c; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--workdir", "/w", "--format", "json"]);
    expect(JSON.parse(written).schemaVersion).toBe(1);
  });
  it("rejects an invalid --format", async () => {
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "x", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "pass" }, gates: [], flow: null, synthesis: { verdict: "pass", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: () => {}, serve: async () => {},
    });
    await expect(program.parseAsync(["node", "review", "A..B", "--workdir", "/w", "--format", "html"]))
      .rejects.toThrow(/--format must be/);
  });
  it("reviews a GitHub PR via injected resolvePr, using the PR body as the requirement", async () => {
    let written = "";
    let loaded: { range: string; requirement: string | null } | null = null;
    const program = buildProgram({
      resolvePr: async ({ number }) => ({ range: `merge-base..HEAD#${number}`, requirement: "cap the discount at 50%", title: "Discount cap" }),
      loadChangeset: async (o) => { loaded = { range: o.range, requirement: o.requirement }; return { diff: "d", requirement: o.requirement, testCmd: o.testCmd, workdir: o.workdir, mode: "spec" }; },
      runReview: async (_ctx, _lang) => ({ tier: "tier-2", gates: [], markdown: "# artifact\n- verdict: needs-human", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "needs-human" }, gates: [], flow: null, synthesis: { verdict: "needs-human", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: (_p, c) => { written = c; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "assay", "pr", "248", "--workdir", "/repo"]);
    expect(written).toContain("# artifact");
    expect(loaded).toEqual({ range: "merge-base..HEAD#248", requirement: "cap the discount at 50%" });
  });
});
