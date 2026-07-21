import { describe, it, expect } from "vitest";
import { loadChangeset } from "../src/core/changeset";
import { runReview } from "../src/core/driver";
import { DockerSandbox } from "../src/sandbox/docker";
import { HeadlessClaudeRunner } from "../src/judgment/headless";
import { PythonSourceMutator, PytestRunner } from "../src/faultinject/python";
const on = process.env.RUN_INT === "1" && (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN);
(on ? describe : describe.skip)("live golden (Docker + claude -p)", () => {
  it("surfaces the unguarded 50% cap on the real fixture", async () => {
    const workdir = new URL("../../docs/superpowers/methodology/fixtures/discount", import.meta.url).pathname;
    const sandbox = new DockerSandbox({ image: process.env.REVIEW_SANDBOX_IMAGE ?? "review-engine-python:latest" });
    const ctx = await loadChangeset({ range: "HEAD~1..HEAD", workdir, testCmd: "python -m pytest -q", requirement: "apply the given percentage discount, capped at 50%" });
    const { markdown, gates } = await runReview({ ...ctx, diff: ctx.diff || "capped = percent if percent <= 50 else 50" }, {
      runner: new HeadlessClaudeRunner(sandbox), mutator: new PythonSourceMutator(),
      testRunner: new PytestRunner(), sandbox,
    });
    expect(gates.find(g => g.gate === 3)!.verdict).toBe("needs-human");
    expect(markdown).toMatch(/caps at 50%/i);
    // Gate 2 should now carry a synthesized flow graph.
    const g2 = gates.find(g => g.gate === 2)!;
    expect(g2.evidence.graph ? (g2.evidence.graph as { nodes: unknown[] }).nodes.length : 0).toBeGreaterThan(0);
  }, 120_000);
});
