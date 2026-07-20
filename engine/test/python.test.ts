import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PythonSourceMutator, PytestRunner } from "../src/faultinject/python";
import { StubSandbox } from "../src/sandbox/sandbox";
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fi-")); writeFileSync(join(dir, "d.py"), "x = 1 if p <= 50 else 50\n"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
describe("PythonSourceMutator", () => {
  it("applies then restores byte-identically", async () => {
    const before = readFileSync(join(dir, "d.py"), "utf8");
    const m = new PythonSourceMutator();
    const restore = await m.apply({ file: "d.py", find: "if p <= 50 else 50", replace: "" }, dir);
    expect(readFileSync(join(dir, "d.py"), "utf8")).not.toBe(before);
    await restore();
    expect(readFileSync(join(dir, "d.py"), "utf8")).toBe(before);
  });
  it("throws when find is not unique or absent", async () => {
    const m = new PythonSourceMutator();
    await expect(m.apply({ file: "d.py", find: "nope", replace: "x" }, dir)).rejects.toThrow();
  });
});
describe("PytestRunner", () => {
  it("parses a green run", async () => {
    const sb = new StubSandbox(() => ({ stdout: "2 passed in 0.01s", stderr: "", exitCode: 0 }));
    const out = await new PytestRunner().run("python -m pytest -q", dir, sb);
    expect(out.passed).toBe(true); expect(out.failedTests).toEqual([]);
  });
  it("parses a red run and extracts failed test ids", async () => {
    const sb = new StubSandbox(() => ({ stdout: "FAILED test_d.py::test_applies\n1 failed, 1 passed", stderr: "", exitCode: 1 }));
    const out = await new PytestRunner().run("python -m pytest -q", dir, sb);
    expect(out.passed).toBe(false);
    expect(out.failedTests).toContain("test_d.py::test_applies");
    expect(sb.calls[0].network).toBe(false);
  });
});
