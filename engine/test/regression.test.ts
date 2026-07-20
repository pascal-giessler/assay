import { describe, it, expect } from "vitest";
import { regressionGate } from "../src/gates/regression";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { TestRunner } from "../src/faultinject/interfaces";
describe("regressionGate", () => {
  it("passes with full-suite selection basis", async () => {
    const runner: TestRunner = { async run() { return { passed: true, failedTests: [], raw: "2 passed" }; } };
    const res = await regressionGate({ testCmd: "pytest", workdir: "/w", runner,
      sandbox: new StubSandbox(() => ({ stdout: "", stderr: "", exitCode: 0 })) });
    expect(res.gate).toBe(4);
    expect(res.verdict).toBe("pass");
    expect(res.evidence["selection-basis"]).toBe("full suite");
  });
});
