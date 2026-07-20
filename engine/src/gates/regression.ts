import type { TestRunner } from "../faultinject/interfaces";
import type { Sandbox } from "../sandbox/sandbox";
import type { GateResult } from "../core/verdicts";
export async function regressionGate(input: {
  testCmd: string; workdir: string; runner: TestRunner; sandbox: Sandbox;
}): Promise<GateResult> {
  const out = await input.runner.run(input.testCmd, input.workdir, input.sandbox);
  return { gate: 4, verdict: out.passed ? "pass" : "fail",
    evidence: { "selection-basis": "full suite", raw: out.raw } };
}
