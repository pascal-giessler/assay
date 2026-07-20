import { describe, it, expect } from "vitest";
import { buildProgram } from "../src/cli/index";
describe("review CLI", () => {
  it("runs a review through injected deps and writes markdown", async () => {
    let written = "";
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "# artifact\n- verdict: needs-human" }),
      renderReport: (md) => `<html>${md}</html>`,
      writeOut: (path, content) => { written = content; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--spec", "s", "--workdir", "/w"]);
    expect(written).toContain("# artifact");
  });
  it("renders HTML when --format html", async () => {
    let written = "";
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "# artifact" }),
      renderReport: (md) => `<html>${md}</html>`,
      writeOut: (_p, c) => { written = c; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--workdir", "/w", "--format", "html"]);
    expect(written).toMatch(/^<html>/);
  });
});
