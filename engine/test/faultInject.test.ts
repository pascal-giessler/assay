import { describe, it, expect } from "vitest";
import { faultInjectGate } from "../src/gates/faultInject";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { Mutator, TestRunner, TestOutcome } from "../src/faultinject/interfaces";
const restored: string[] = [];
const mutator: Mutator = { async apply(m) { return async () => { restored.push(m.find); }; } };
// runner returns red for the percentage mutation, green for the cap removal
const runner: TestRunner = {
  async run(): Promise<TestOutcome> { throw new Error("unused"); }
};
describe("faultInjectGate", () => {
  it("marks cap unguarded (green) and percentage guarded (red), verdict needs-human at tier-2", async () => {
    const outcomes: Record<string, TestOutcome> = {
      "capped / 100": { passed: false, failedTests: ["test_applies"], raw: "" }, // percentage -> red
      "else 50": { passed: true, failedTests: [], raw: "" },                       // cap -> green
    };
    const r2: TestRunner = { async run() { return outcomes[cur]; } };
    let cur = "";
    const m2: Mutator = { async apply(m) { cur = m.find; return async () => { restored.push(m.find); }; } };
    const res = await faultInjectGate({
      criteria: [
        { criterion: "applies percentage", mutation: { file: "d.py", find: "capped / 100", replace: "capped / 50" } },
        { criterion: "caps at 50%", mutation: { file: "d.py", find: "else 50", replace: "" } },
      ],
      baselineOutcome: { passed: true, failedTests: [], raw: "" },
      testCmd: "pytest", workdir: "/w", tier: "tier-2",
      mutator: m2, runner: r2, sandbox: new StubSandbox(() => ({ stdout: "", stderr: "", exitCode: 0 })),
    });
    expect(res.gate).toBe(3);
    expect(res.verdict).toBe("needs-human");
    expect(res.evidence["unguarded-paths"]).toEqual(["caps at 50%"]);
    const table = res.evidence["guarding-test-table"] as any[];
    expect(table.find(t => t.criterion === "applies percentage").status).toBe("guarded");
    expect(table.find(t => t.criterion === "caps at 50%").status).toBe("unguarded");
    expect(restored.length).toBe(2); // both mutations restored
  });

  it("returns needs-human without running mutations when the baseline is not green", async () => {
    let applyCalled = false;
    const notCalledMutator: Mutator = { async apply(m) { applyCalled = true; return async () => {}; } };
    const notCalledRunner: TestRunner = { async run() { throw new Error("should not be called"); } };
    const res = await faultInjectGate({
      criteria: [
        { criterion: "applies percentage", mutation: { file: "d.py", find: "capped / 100", replace: "capped / 50" } },
        { criterion: "caps at 50%", mutation: { file: "d.py", find: "else 50", replace: "" } },
      ],
      baselineOutcome: { passed: false, failedTests: ["test_applies"], raw: "" },
      testCmd: "pytest", workdir: "/w", tier: "tier-2",
      mutator: notCalledMutator, runner: notCalledRunner, sandbox: new StubSandbox(() => ({ stdout: "", stderr: "", exitCode: 0 })),
    });
    expect(res.gate).toBe(3);
    expect(res.verdict).toBe("needs-human");
    expect(applyCalled).toBe(false);
    expect(res.evidence["guarding-test-table"]).toEqual([]);
    expect(res.evidence["unguarded-paths"]).toEqual([]);
    expect(res.evidence.baseline).toMatch(/not green/i);
  });
});
