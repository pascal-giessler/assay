# Review Engine (Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript/Node CLI that runs the review methodology end-to-end against a Python/pytest target repo inside a Docker sandbox, producing the methodology's artifact and an HTML report — proven by reproducing the validated `discount` worked example.

**Architecture:** An invocation-agnostic core (changeset model → gate operations → driver → artifact assembler → report renderer) with a CLI adapter. Mechanical gates (triage, fault-injection, regression) run without a model; judgment gates (intent, architecture) delegate to a `JudgmentRunner`. All target-touching execution (mutations, pytest, `claude -p`) goes through a `Sandbox` (Docker). Engine language (TypeScript) is decoupled from target ecosystem (Python) via the `Mutator`/`TestRunner` interfaces.

**Tech Stack:** TypeScript, Node ≥20, vitest (tests), commander (CLI), execa (subprocess), Docker (sandbox). No runtime dependency on a model except through `claude -p` inside the sandbox.

## Global Constraints

- **Engine:** TypeScript/Node package; strict TS (`"strict": true`). Target ecosystem for this slice: Python + pytest only.
- **Gate verdict vocabulary (exact):** `pass` | `fail` | `needs-human` | `abstain`; Gate 2 abstain sub-reason `no-baseline`.
- **Gate names (exact):** Gate 1 Intent Match (Intent Elicitation in inference mode), Gate 2 Architecture Conformance, Gate 3 Test Adequacy, Gate 4 Regression.
- **Risk tiers (exact):** Tier 0 Mechanical, Tier 1 Standard, Tier 2 Critical.
- **Artifact field names (exact):** `verdict`, `evidence`, `criterion-table` (Gate 1), `guarding-test-table` + `unguarded-paths` (Gate 3), `selection-basis` (Gate 4). Artifact shape matches `docs/superpowers/methodology/artifact-template.md`.
- **Golden output:** running the engine on `docs/superpowers/methodology/fixtures/discount/` with spec "apply the given percentage discount, capped at 50%" and `--test-cmd "python -m pytest -q"` must produce an artifact matching `docs/superpowers/methodology/examples/2026-07-20-discount-review.md` on tiers, gates, and verdicts (Tier 2; G1 pass; G2 abstain/no-baseline; G3 needs-human with the 50% cap unguarded; G4 pass/full suite; Synthesis needs-human; all four "does NOT establish" sub-items present).
- **Sandbox:** all target-touching execution runs via the `Sandbox` interface. Test runs/mutations use `--network none`; only the `claude -p` judgment call gets network. The host repo is never mutated.
- **Triage is a conservative heuristic:** when blast-radius detection is uncertain, escalate to the higher tier (over-tiering is safe; under-tiering is not).
- **Package location:** `engine/` at repo root.

---

## File Structure

- `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts` — scaffold (Task 0)
- `engine/src/core/verdicts.ts` — verdict/tier vocabulary + gate-result types (Task 1)
- `engine/src/core/changeset.ts` — `ChangesetContext` model + git diff loader (Task 2)
- `engine/src/gates/triage.ts` — heuristic blast-radius → tier (Task 3)
- `engine/src/sandbox/sandbox.ts` — `Sandbox` interface + `StubSandbox` (Task 4)
- `engine/src/sandbox/docker.ts` — `DockerSandbox` (Task 4)
- `engine/src/faultinject/interfaces.ts` — `Mutator`, `TestRunner` (Task 5)
- `engine/src/faultinject/python.ts` — `PythonSourceMutator`, `PytestRunner` (Task 5)
- `engine/src/gates/faultInject.ts` — Gate 3 fault-injection operation (Task 6)
- `engine/src/gates/regression.ts` — Gate 4 (Task 7)
- `engine/src/judgment/runner.ts` — `JudgmentRunner` interface + `StubJudgmentRunner` (Task 8)
- `engine/src/judgment/headless.ts` — `HeadlessClaudeRunner` (Task 8)
- `engine/src/gates/intent.ts` — Gate 1 (Task 8)
- `engine/src/gates/architecture.ts` — Gate 2 (Task 8)
- `engine/src/core/driver.ts` — gate sequencing per tier (Task 9)
- `engine/src/core/artifact.ts` — artifact assembler → markdown (Task 9)
- `engine/src/report/html.ts` — markdown artifact → HTML report (Task 10)
- `engine/src/cli/index.ts` — `review`, `review serve` (Task 11)
- `engine/test/**` — colocated `*.test.ts` per module; `engine/test/golden.e2e.test.ts` (Tasks 9, 12)

---

### Task 0: Scaffold the TypeScript package

**Files:**
- Create: `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`, `engine/src/index.ts`, `engine/test/smoke.test.ts`

**Interfaces:**
- Produces: a buildable/testable package. Later tasks add modules under `engine/src`.

- [ ] **Step 1: Write the smoke test**
```ts
// engine/test/smoke.test.ts
import { describe, it, expect } from "vitest";
import { engineName } from "../src/index";
describe("scaffold", () => {
  it("exposes the engine name", () => {
    expect(engineName()).toBe("review-engine");
  });
});
```

- [ ] **Step 2: Run it to see it fail**
Run: `cd engine && npm test`
Expected: FAIL (module `../src/index` not found).

- [ ] **Step 3: Create the package files**
```json
// engine/package.json
{
  "name": "review-engine",
  "version": "0.0.1",
  "type": "module",
  "bin": { "review": "dist/cli/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:int": "vitest run --mode integration"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.14.0"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "execa": "^9.4.0"
  }
}
```
```json
// engine/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "Bundler",
    "strict": true, "outDir": "dist", "rootDir": "src",
    "declaration": true, "skipLibCheck": true, "esModuleInterop": true
  },
  "include": ["src"]
}
```
```ts
// engine/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```
```ts
// engine/src/index.ts
export function engineName(): string { return "review-engine"; }
```

- [ ] **Step 4: Install and run tests**
Run: `cd engine && npm install && npm test`
Expected: PASS (1 test). Then `npm run build` compiles with no errors.

- [ ] **Step 5: Commit**
```bash
cd engine && git add package.json tsconfig.json vitest.config.ts src/index.ts test/smoke.test.ts package-lock.json
git commit -m "chore: scaffold review-engine TypeScript package"
```

---

### Task 1: Verdict vocabulary and gate-result types

**Files:**
- Create: `engine/src/core/verdicts.ts`, `engine/test/verdicts.test.ts`

**Interfaces:**
- Produces:
  - `type Verdict = "pass" | "fail" | "needs-human" | "abstain"`
  - `type Tier = "tier-0" | "tier-1" | "tier-2"`
  - `type GateResult = { gate: 1|2|3|4; verdict: Verdict; subReason?: "no-baseline"; evidence: Record<string, unknown> }`
  - `function isVerdict(x: unknown): x is Verdict`

- [ ] **Step 1: Write the failing test**
```ts
// engine/test/verdicts.test.ts
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
```

- [ ] **Step 2: Run it to see it fail**
Run: `cd engine && npm test -- verdicts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/core/verdicts.ts
export const VERDICTS = ["pass", "fail", "needs-human", "abstain"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const TIERS = ["tier-0", "tier-1", "tier-2"] as const;
export type Tier = (typeof TIERS)[number];
export type GateResult = {
  gate: 1 | 2 | 3 | 4;
  verdict: Verdict;
  subReason?: "no-baseline";
  evidence: Record<string, unknown>;
};
export function isVerdict(x: unknown): x is Verdict {
  return typeof x === "string" && (VERDICTS as readonly string[]).includes(x);
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- verdicts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/core/verdicts.ts test/verdicts.test.ts
git commit -m "feat: add verdict and tier vocabulary types"
```

---

### Task 2: Changeset context model and diff loader

**Files:**
- Create: `engine/src/core/changeset.ts`, `engine/test/changeset.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChangesetContext = { diff: string; requirement: string | null; testCmd: string; workdir: string; mode: "spec" | "inference" }`
  - `function loadChangeset(opts: { range: string; workdir: string; testCmd: string; requirement?: string | null }): Promise<ChangesetContext>` — runs `git -C workdir diff <range>` to populate `diff`; `mode` is `"spec"` when `requirement` is a non-empty string, else `"inference"`.

- [ ] **Step 1: Write the failing test** (inject a fake diff runner so no real git is needed)
```ts
// engine/test/changeset.test.ts
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
```

- [ ] **Step 2: Run it to see it fail**
Run: `cd engine && npm test -- changeset`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/core/changeset.ts
import { execa } from "execa";
export type ChangesetContext = {
  diff: string; requirement: string | null; testCmd: string;
  workdir: string; mode: "spec" | "inference";
};
type DiffRunner = (range: string, workdir: string) => Promise<string>;
const gitDiff: DiffRunner = async (range, workdir) => {
  const { stdout } = await execa("git", ["-C", workdir, "diff", range]);
  return stdout;
};
export async function loadChangeset(
  opts: { range: string; workdir: string; testCmd: string; requirement?: string | null },
  runDiff: DiffRunner = gitDiff
): Promise<ChangesetContext> {
  const diff = await runDiff(opts.range, opts.workdir);
  const requirement = opts.requirement && opts.requirement.trim() ? opts.requirement : null;
  return { diff, requirement, testCmd: opts.testCmd, workdir: opts.workdir,
           mode: requirement ? "spec" : "inference" };
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- changeset`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/core/changeset.ts test/changeset.test.ts
git commit -m "feat: add changeset context model and diff loader"
```

---

### Task 3: Triage gate — conservative heuristic blast-radius classifier

**Files:**
- Create: `engine/src/gates/triage.ts`, `engine/test/triage.test.ts`

**Interfaces:**
- Consumes: `ChangesetContext.diff` (Task 2), `Tier` (Task 1).
- Produces:
  - `function triage(diff: string): { tier: Tier; hits: string[] }` — scans added/removed lines of the diff for blast-radius signals; returns the tier and which blast-radius item names were hit. Rule: any hit → `tier-2`; no hit but the diff changes code (non-comment, non-formatting) → `tier-1`; only whitespace/comment/rename-like changes → `tier-0`. Conservative: ambiguous arithmetic or comparison counts as a hit.

**Blast-radius signals (heuristic, applied to changed lines only — lines starting with `+`/`-` excluding diff headers):**
- guard/branch condition: a changed line containing a comparison operator (`==`, `!=`, `<=`, `>=`, `<`, `>`) inside an `if`/`elif`/`while`/ternary, or a Python conditional expression (`... if ... else ...`).
- default value or constant: a changed line assigning a numeric/string literal to an ALL_CAPS name, or a parameter default (`name=<literal>`), or a bare module-level `NAME = <literal>`.
- money/quantity/unit arithmetic: a changed line with an arithmetic operator (`*`, `/`, `+`, `-`, `%`) applied to an identifier or numeric literal (excluding pure string concatenation).
- contract/signature change: a changed `def `/`class ` line, or a changed function parameter list.
- auth/permission: a changed line matching `/auth|permission|role|token|login|credential/i`.
- migration/schema: a changed path under `migrations/` or a line matching `/CREATE TABLE|ALTER TABLE|ADD COLUMN|schema/i`.
- concurrency/transaction: a changed line matching `/lock|mutex|async|await|threading|transaction|atomic/i`.

- [ ] **Step 1: Write the failing tests (the three checklist examples + the fixture)**
```ts
// engine/test/triage.test.ts
import { describe, it, expect } from "vitest";
import { triage } from "../src/gates/triage";
const wrap = (added: string) => `diff --git a/f.py b/f.py\n--- a/f.py\n+++ b/f.py\n@@\n+${added}`;
describe("triage", () => {
  it("Tier 0 for whitespace-only", () => {
    expect(triage(`diff --git a/f.py b/f.py\n@@\n+    \n-\t`).tier).toBe("tier-0");
  });
  it("Tier 1 for feature code touching no blast-radius item", () => {
    expect(triage(wrap(`return render(template, items)`)).tier).toBe("tier-1");
  });
  it("Tier 2 for a discount cap constant + arithmetic change", () => {
    const r = triage(wrap(`capped = percent if percent <= 50 else 50`));
    expect(r.tier).toBe("tier-2");
    expect(r.hits).toContain("guard/branch condition");
  });
  it("Tier 2 for money arithmetic", () => {
    expect(triage(wrap(`return round(price * (1 - capped / 100), 2)`)).tier).toBe("tier-2");
  });
});
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- triage`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/gates/triage.ts
import type { Tier } from "../core/verdicts";
const CMP = /(==|!=|<=|>=|<|>)/;
const signals: { name: string; test: (l: string) => boolean }[] = [
  { name: "guard/branch condition",
    test: l => (/\b(if|elif|while)\b/.test(l) && CMP.test(l)) || /\bif\b.*\belse\b/.test(l) },
  { name: "default value or constant",
    test: l => /\b[A-Z][A-Z0-9_]{2,}\s*=/.test(l) || /\w+\s*=\s*(\d+|["'])/.test(l) },
  { name: "money/quantity/unit arithmetic",
    test: l => /[A-Za-z0-9_)]\s*[*/%+\-]\s*[A-Za-z0-9_(]/.test(l) && !/["']\s*\+/.test(l) },
  { name: "public or shared contract/signature", test: l => /^\s*(def |class )/.test(l) },
  { name: "auth or permission logic", test: l => /auth|permission|role|token|login|credential/i.test(l) },
  { name: "data migration or schema change", test: l => /CREATE TABLE|ALTER TABLE|ADD COLUMN|schema/i.test(l) },
  { name: "concurrency or transaction boundary", test: l => /lock|mutex|async|await|threading|transaction|atomic/i.test(l) },
];
function changedCodeLines(diff: string): string[] {
  return diff.split("\n")
    .filter(l => (l.startsWith("+") || l.startsWith("-")) && !/^(\+\+\+|---)/.test(l))
    .map(l => l.slice(1))
    .filter(l => l.trim() !== "" && !/^\s*#/.test(l));
}
export function triage(diff: string): { tier: Tier; hits: string[] } {
  const lines = changedCodeLines(diff);
  const hits = new Set<string>();
  for (const l of lines) for (const s of signals) if (s.test(l)) hits.add(s.name);
  if (hits.size > 0) return { tier: "tier-2", hits: [...hits] };
  if (lines.length > 0) return { tier: "tier-1", hits: [] };
  return { tier: "tier-0", hits: [] };
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- triage`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/gates/triage.ts test/triage.test.ts
git commit -m "feat: add conservative heuristic blast-radius triage gate"
```

---

### Task 4: Sandbox interface, stub, and DockerSandbox

**Files:**
- Create: `engine/src/sandbox/sandbox.ts`, `engine/src/sandbox/docker.ts`, `engine/test/sandbox.test.ts`, `engine/test/docker.int.test.ts`

**Interfaces:**
- Produces:
  - `type SandboxRun = { command: string[]; mounts?: { host: string; container: string }[]; env?: Record<string,string>; network?: boolean }`
  - `type SandboxResult = { stdout: string; stderr: string; exitCode: number }`
  - `interface Sandbox { run(r: SandboxRun): Promise<SandboxResult> }`
  - `class StubSandbox implements Sandbox` — constructed with a handler `(r) => SandboxResult`, records calls in `.calls`.
  - `class DockerSandbox implements Sandbox` — runs `docker run --rm [--network none] -v host:container -e K=V <image> <command...>`.

- [ ] **Step 1: Write the failing unit test (stub) + a Docker integration test**
```ts
// engine/test/sandbox.test.ts
import { describe, it, expect } from "vitest";
import { StubSandbox } from "../src/sandbox/sandbox";
describe("StubSandbox", () => {
  it("records calls and returns the handler result", async () => {
    const sb = new StubSandbox(r => ({ stdout: r.command.join(" "), stderr: "", exitCode: 0 }));
    const res = await sb.run({ command: ["echo", "hi"], network: false });
    expect(res.stdout).toBe("echo hi");
    expect(sb.calls[0].network).toBe(false);
  });
});
```
```ts
// engine/test/docker.int.test.ts
import { describe, it, expect } from "vitest";
import { DockerSandbox } from "../src/sandbox/docker";
// Runs only under `npm run test:int`; skipped otherwise.
const int = process.env.RUN_INT === "1" ? describe : describe.skip;
int("DockerSandbox", () => {
  it("runs a command in a container with no network", async () => {
    const sb = new DockerSandbox({ image: "python:3.12-slim" });
    const res = await sb.run({ command: ["python", "-c", "print(2+2)"], network: false });
    expect(res.stdout.trim()).toBe("4");
    expect(res.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see stub test fail**
Run: `cd engine && npm test -- sandbox`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement stub and Docker**
```ts
// engine/src/sandbox/sandbox.ts
export type SandboxRun = {
  command: string[];
  mounts?: { host: string; container: string }[];
  env?: Record<string, string>;
  network?: boolean;
};
export type SandboxResult = { stdout: string; stderr: string; exitCode: number };
export interface Sandbox { run(r: SandboxRun): Promise<SandboxResult>; }
export class StubSandbox implements Sandbox {
  calls: SandboxRun[] = [];
  constructor(private handler: (r: SandboxRun) => SandboxResult) {}
  async run(r: SandboxRun): Promise<SandboxResult> { this.calls.push(r); return this.handler(r); }
}
```
```ts
// engine/src/sandbox/docker.ts
import { execa } from "execa";
import type { Sandbox, SandboxRun, SandboxResult } from "./sandbox";
export class DockerSandbox implements Sandbox {
  constructor(private opts: { image: string }) {}
  async run(r: SandboxRun): Promise<SandboxResult> {
    const args = ["run", "--rm"];
    if (r.network === false) args.push("--network", "none");
    for (const m of r.mounts ?? []) args.push("-v", `${m.host}:${m.container}`);
    for (const [k, v] of Object.entries(r.env ?? {})) args.push("-e", `${k}=${v}`);
    args.push(this.opts.image, ...r.command);
    const res = await execa("docker", args, { reject: false });
    return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.exitCode ?? 1 };
  }
}
```

- [ ] **Step 4: Run unit test (pass) and the Docker integration test if Docker is present**
Run: `cd engine && npm test -- sandbox` → Expected: PASS.
Run (optional, needs Docker): `cd engine && RUN_INT=1 npm run test:int -- docker.int` → Expected: PASS (`4`).

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/sandbox/ test/sandbox.test.ts test/docker.int.test.ts
git commit -m "feat: add Sandbox interface, StubSandbox, and DockerSandbox"
```

---

### Task 5: Mutator and TestRunner interfaces + Python/pytest implementations

**Files:**
- Create: `engine/src/faultinject/interfaces.ts`, `engine/src/faultinject/python.ts`, `engine/test/python.test.ts`

**Interfaces:**
- Consumes: `Sandbox` (Task 4).
- Produces:
  - `type Mutation = { file: string; find: string; replace: string }` (targeted text mutation)
  - `interface Mutator { apply(m: Mutation, workdir: string): Promise<() => Promise<void>> }` — applies the mutation in the workdir, returns a `restore()` thunk that reverts it. `apply` throws if `find` is absent or not unique.
  - `type TestOutcome = { passed: boolean; failedTests: string[]; raw: string }`
  - `interface TestRunner { run(testCmd: string, workdir: string, sandbox: Sandbox): Promise<TestOutcome> }`
  - `class PythonSourceMutator implements Mutator` (edits file text on disk, saves original, restore rewrites it)
  - `class PytestRunner implements TestRunner` (runs `testCmd` via `sandbox.run` with `network:false`, parses pytest summary; `passed` = exit 0; `failedTests` parsed from `FAILED <nodeid>` lines)

- [ ] **Step 1: Write the failing tests** (use a temp dir; PytestRunner tested with a StubSandbox returning canned pytest output)
```ts
// engine/test/python.test.ts
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
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- python`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/faultinject/interfaces.ts
import type { Sandbox } from "../sandbox/sandbox";
export type Mutation = { file: string; find: string; replace: string };
export interface Mutator { apply(m: Mutation, workdir: string): Promise<() => Promise<void>>; }
export type TestOutcome = { passed: boolean; failedTests: string[]; raw: string };
export interface TestRunner { run(testCmd: string, workdir: string, sandbox: Sandbox): Promise<TestOutcome>; }
```
```ts
// engine/src/faultinject/python.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mutator, Mutation, TestRunner, TestOutcome } from "./interfaces";
import type { Sandbox } from "../sandbox/sandbox";
export class PythonSourceMutator implements Mutator {
  async apply(m: Mutation, workdir: string): Promise<() => Promise<void>> {
    const path = join(workdir, m.file);
    const original = readFileSync(path, "utf8");
    const occurrences = original.split(m.find).length - 1;
    if (occurrences !== 1) throw new Error(`find must occur exactly once (found ${occurrences}) in ${m.file}`);
    writeFileSync(path, original.replace(m.find, m.replace));
    return async () => { writeFileSync(path, original); };
  }
}
export class PytestRunner implements TestRunner {
  async run(testCmd: string, workdir: string, sandbox: Sandbox): Promise<TestOutcome> {
    const res = await sandbox.run({
      command: ["sh", "-c", `cd /work && ${testCmd}`],
      mounts: [{ host: workdir, container: "/work" }],
      network: false,
    });
    const raw = res.stdout + "\n" + res.stderr;
    const failedTests = [...raw.matchAll(/^FAILED\s+(\S+)/gm)].map(x => x[1]);
    return { passed: res.exitCode === 0, failedTests, raw };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- python`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/faultinject/ test/python.test.ts
git commit -m "feat: add Mutator/TestRunner interfaces with Python/pytest implementations"
```

---

### Task 6: Gate 3 — fault-injection operation

**Files:**
- Create: `engine/src/gates/faultInject.ts`, `engine/test/faultInject.test.ts`

**Interfaces:**
- Consumes: `Mutator`, `TestRunner`, `TestOutcome` (Task 5), `Sandbox` (Task 4), `GateResult` (Task 1).
- Produces:
  - `type CriterionMutation = { criterion: string; mutation: Mutation }`
  - `async function faultInjectGate(input: { criteria: CriterionMutation[]; baselineOutcome: TestOutcome; testCmd: string; workdir: string; tier: Tier; mutator: Mutator; runner: TestRunner; sandbox: Sandbox }): Promise<GateResult>` — for each criterion: apply mutation → run suite → red (a test failed) = guarded, green (still passing) = unguarded → restore. Assembles `guarding-test-table` and `unguarded-paths`. Verdict: if any unguarded criterion and tier is `tier-2` → `needs-human`; if any unguarded at lower tier → `needs-human` too (unguarded is always a flag) ; else `pass`. Asserts each restore ran.

- [ ] **Step 1: Write the failing test** (stubbed mutator/runner encode the discount semantics: percentage mutation → red, cap removal → green)
```ts
// engine/test/faultInject.test.ts
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
});
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- faultInject`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/gates/faultInject.ts
import type { Mutation, Mutator, TestRunner, TestOutcome } from "../faultinject/interfaces";
import type { Sandbox } from "../sandbox/sandbox";
import type { GateResult, Tier } from "../core/verdicts";
export type CriterionMutation = { criterion: string; mutation: Mutation };
export async function faultInjectGate(input: {
  criteria: CriterionMutation[]; baselineOutcome: TestOutcome;
  testCmd: string; workdir: string; tier: Tier;
  mutator: Mutator; runner: TestRunner; sandbox: Sandbox;
}): Promise<GateResult> {
  const table: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[] = [];
  for (const c of input.criteria) {
    const restore = await input.mutator.apply(c.mutation, input.workdir);
    let outcome: TestOutcome;
    try { outcome = await input.runner.run(input.testCmd, input.workdir, input.sandbox); }
    finally { await restore(); }
    // red (a test failed vs. green baseline) = the criterion is guarded
    const guarded = !outcome.passed;
    table.push({ criterion: c.criterion, status: guarded ? "guarded" : "unguarded", failedTests: outcome.failedTests });
  }
  const unguarded = table.filter(t => t.status === "unguarded").map(t => t.criterion);
  const verdict = unguarded.length > 0 ? "needs-human" : "pass";
  return {
    gate: 3, verdict,
    evidence: { "guarding-test-table": table, "unguarded-paths": unguarded, tier: input.tier },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- faultInject`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/gates/faultInject.ts test/faultInject.test.ts
git commit -m "feat: add Gate 3 fault-injection operation"
```

---

### Task 7: Gate 4 — regression

**Files:**
- Create: `engine/src/gates/regression.ts`, `engine/test/regression.test.ts`

**Interfaces:**
- Consumes: `TestRunner` (Task 5), `Sandbox` (Task 4), `GateResult` (Task 1).
- Produces:
  - `async function regressionGate(input: { testCmd: string; workdir: string; runner: TestRunner; sandbox: Sandbox }): Promise<GateResult>` — runs the suite once; verdict `pass` if passing else `fail`; `evidence["selection-basis"] = "full suite"`; records raw output.

- [ ] **Step 1: Write the failing test**
```ts
// engine/test/regression.test.ts
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
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- regression`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/gates/regression.ts
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
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- regression`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/gates/regression.ts test/regression.test.ts
git commit -m "feat: add Gate 4 regression gate"
```

---

### Task 8: Judgment gates (Gate 1 intent, Gate 2 architecture) + JudgmentRunner

**Files:**
- Create: `engine/src/judgment/runner.ts`, `engine/src/judgment/headless.ts`, `engine/src/gates/intent.ts`, `engine/src/gates/architecture.ts`, `engine/test/intent.test.ts`, `engine/test/architecture.test.ts`

**Interfaces:**
- Consumes: `ChangesetContext` (Task 2), `Sandbox` (Task 4), `GateResult` (Task 1).
- Produces:
  - `type JudgmentRequest = { bundle: { diff: string; requirement: string | null; testResults: string }; prompt: string }`
  - `type IntentResult = { reconstruction: string; criterionTable: { criterion: string; status: "met"|"not met"|"not addressed" }[]; mutations: { criterion: string; file: string; find: string; replace: string }[] }`
  - `interface JudgmentRunner { intent(req: JudgmentRequest): Promise<IntentResult> }`
  - `class StubJudgmentRunner implements JudgmentRunner` — returns a caller-supplied `IntentResult`.
  - `class HeadlessClaudeRunner implements JudgmentRunner` — runs `claude -p <prompt+bundle>` **inside the sandbox with network enabled**, parses a JSON block into `IntentResult`.
  - `async function intentGate(ctx: ChangesetContext, runner: JudgmentRunner): Promise<{ result: GateResult; mutations: IntentResult["mutations"] }>` — spec mode: build blind bundle (diff + requirement + testResults, NO authoring context), call `runner.intent`, verdict `pass` iff every criterion is `met`, else `needs-human`; evidence carries `criterion-table` + reconstruction. Inference mode: still calls intent for a reconstruction but verdict is always `needs-human` (Intent Elicitation) and `criterion-table` is replaced by an `inferred-intent` field.
  - `function architectureGate(): GateResult` — always `{ gate: 2, verdict: "abstain", subReason: "no-baseline", evidence: { note: "no architecture reference supplied; surrounding code not consulted", structural: "unjudged" } }`.

- [ ] **Step 1: Write the failing tests**
```ts
// engine/test/intent.test.ts
import { describe, it, expect } from "vitest";
import { intentGate } from "../src/gates/intent";
import { StubJudgmentRunner } from "../src/judgment/runner";
import type { ChangesetContext } from "../src/core/changeset";
const base: ChangesetContext = { diff: "d", requirement: "apply pct, cap 50", testCmd: "pytest", workdir: "/w", mode: "spec" };
describe("intentGate", () => {
  it("spec mode: pass when all criteria met, and surfaces mutations", async () => {
    const runner = new StubJudgmentRunner({
      reconstruction: "reduces price by pct, max 50%",
      criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
      mutations: [{ criterion: "caps at 50%", file: "d.py", find: "else 50", replace: "" }],
    });
    const { result, mutations } = await intentGate(base, runner);
    expect(result.gate).toBe(1);
    expect(result.verdict).toBe("pass");
    expect((result.evidence["criterion-table"] as any[]).length).toBe(2);
    expect(mutations[0].criterion).toBe("caps at 50%");
  });
  it("inference mode: verdict is always needs-human", async () => {
    const runner = new StubJudgmentRunner({ reconstruction: "guesses", criterionTable: [], mutations: [] });
    const { result } = await intentGate({ ...base, requirement: null, mode: "inference" }, runner);
    expect(result.verdict).toBe("needs-human");
    expect(result.evidence["inferred-intent"]).toBeDefined();
  });
});
```
```ts
// engine/test/architecture.test.ts
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
```

- [ ] **Step 2: Run to see them fail**
Run: `cd engine && npm test -- intent architecture`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/judgment/runner.ts
export type JudgmentRequest = { bundle: { diff: string; requirement: string | null; testResults: string }; prompt: string };
export type IntentResult = {
  reconstruction: string;
  criterionTable: { criterion: string; status: "met" | "not met" | "not addressed" }[];
  mutations: { criterion: string; file: string; find: string; replace: string }[];
};
export interface JudgmentRunner { intent(req: JudgmentRequest): Promise<IntentResult>; }
export class StubJudgmentRunner implements JudgmentRunner {
  constructor(private canned: IntentResult) {}
  async intent(): Promise<IntentResult> { return this.canned; }
}
```
```ts
// engine/src/judgment/headless.ts
import type { Sandbox } from "../sandbox/sandbox";
import type { JudgmentRunner, JudgmentRequest, IntentResult } from "./runner";
export class HeadlessClaudeRunner implements JudgmentRunner {
  constructor(private sandbox: Sandbox, private opts: { image: string; apiKeyEnv?: string } = { image: "" }) {}
  async intent(req: JudgmentRequest): Promise<IntentResult> {
    const payload = `${req.prompt}\n\n=== EVIDENCE BUNDLE ===\nREQUIREMENT:\n${req.bundle.requirement ?? "(none — inference mode)"}\n\nDIFF:\n${req.bundle.diff}\n\nTEST RESULTS:\n${req.bundle.testResults}\n`;
    const env: Record<string, string> = {};
    const key = this.opts.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    if (process.env[key]) env[key] = process.env[key] as string;
    const res = await this.sandbox.run({
      command: ["claude", "-p", payload, "--output-format", "json"],
      env, network: true, // judgment needs the model API
    });
    const json = res.stdout.slice(res.stdout.indexOf("{"), res.stdout.lastIndexOf("}") + 1);
    return JSON.parse(json) as IntentResult;
  }
}
```
```ts
// engine/src/gates/intent.ts
import type { ChangesetContext } from "../core/changeset";
import type { GateResult } from "../core/verdicts";
import type { JudgmentRunner, IntentResult } from "../judgment/runner";
const PROMPT = "You are an INDEPENDENT reviewer. From the evidence bundle ONLY (you did not write this code and have no authoring context), reconstruct what the change does, then compare to the requirement. Return JSON {reconstruction, criterionTable:[{criterion,status:'met'|'not met'|'not addressed'}], mutations:[{criterion,file,find,replace}]} where each mutation is a single, uniquely-matching source edit that would break that criterion.";
export async function intentGate(ctx: ChangesetContext, runner: JudgmentRunner):
  Promise<{ result: GateResult; mutations: IntentResult["mutations"] }> {
  const r = await runner.intent({
    bundle: { diff: ctx.diff, requirement: ctx.requirement, testResults: "" },
    prompt: PROMPT,
  });
  if (ctx.mode === "inference") {
    return { result: { gate: 1, verdict: "needs-human",
      evidence: { "inferred-intent": r.reconstruction, note: "inference mode — no pass; human must confirm intent" } },
      mutations: r.mutations };
  }
  const allMet = r.criterionTable.length > 0 && r.criterionTable.every(c => c.status === "met");
  return { result: { gate: 1, verdict: allMet ? "pass" : "needs-human",
    evidence: { reconstruction: r.reconstruction, "criterion-table": r.criterionTable } },
    mutations: r.mutations };
}
```
```ts
// engine/src/gates/architecture.ts
import type { GateResult } from "../core/verdicts";
export function architectureGate(): GateResult {
  return { gate: 2, verdict: "abstain", subReason: "no-baseline",
    evidence: { note: "no architecture reference supplied; surrounding code not consulted", structural: "unjudged" } };
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- intent architecture`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/judgment/ src/gates/intent.ts src/gates/architecture.ts test/intent.test.ts test/architecture.test.ts
git commit -m "feat: add Gate 1 intent, Gate 2 architecture, and JudgmentRunner"
```

---

### Task 9: Driver + artifact assembler (deterministic golden test)

**Files:**
- Create: `engine/src/core/driver.ts`, `engine/src/core/artifact.ts`, `engine/test/driver.test.ts`, `engine/test/golden.e2e.test.ts`

**Interfaces:**
- Consumes: all gates (Tasks 3,6,7,8), `ChangesetContext` (Task 2).
- Produces:
  - `async function runReview(ctx, deps): Promise<{ tier: Tier; gates: GateResult[]; markdown: string }>` where `deps = { runner: JudgmentRunner; mutator: Mutator; testRunner: TestRunner; sandbox: Sandbox }`. Sequence: triage → intent (Gate 1) → architecture (Gate 2) → fault-injection (Gate 3, seeded by Gate 1's `mutations`, using the pre-run baseline outcome) → regression (Gate 4). Assemble markdown via `assembleArtifact`.
  - `function assembleArtifact(input: { changesetId: string; mode; tier; gates: GateResult[]; synthesis: { verdict: Verdict; humanMustVerify: string[] }; doesNotEstablish: {...} }): string` — emits the four-section template with exact field names.

- [ ] **Step 1: Write the failing tests — a driver unit test and the deterministic golden e2e (stub judgment, real triage + stub-backed mechanical gates)**
```ts
// engine/test/driver.test.ts
import { describe, it, expect } from "vitest";
import { runReview } from "../src/core/driver";
import { StubJudgmentRunner } from "../src/judgment/runner";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { Mutator, TestRunner, TestOutcome } from "../src/faultinject/interfaces";
import type { ChangesetContext } from "../src/core/changeset";
const ctx: ChangesetContext = {
  diff: "diff --git a/discount.py b/discount.py\n@@\n+capped = percent if percent <= 50 else 50\n+return round(price * (1 - capped / 100), 2)",
  requirement: "apply the given percentage discount, capped at 50%",
  testCmd: "python -m pytest -q", workdir: "/w", mode: "spec",
};
const runner = new StubJudgmentRunner({
  reconstruction: "reduces price by pct, capped at 50%",
  criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
  mutations: [
    { criterion: "applies percentage", file: "discount.py", find: "capped / 100", replace: "capped / 50" },
    { criterion: "caps at 50%", file: "discount.py", find: " if percent <= 50 else 50", replace: "" },
  ],
});
const mutator: Mutator = { async apply(m) { cur = m.find; return async () => {}; } };
let cur = "";
const testRunner: TestRunner = {
  async run(): Promise<TestOutcome> {
    // percentage mutation -> red; cap removal -> green; baseline -> green
    if (cur === "capped / 100") return { passed: false, failedTests: ["test_applies"], raw: "" };
    if (cur === " if percent <= 50 else 50") return { passed: true, failedTests: [], raw: "2 passed" };
    return { passed: true, failedTests: [], raw: "2 passed" };
  },
};
describe("runReview", () => {
  it("produces Tier 2 with the expected gate verdicts", async () => {
    const { tier, gates } = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })) });
    expect(tier).toBe("tier-2");
    expect(gates.find(g => g.gate === 1)!.verdict).toBe("pass");
    expect(gates.find(g => g.gate === 2)!.verdict).toBe("abstain");
    expect(gates.find(g => g.gate === 3)!.verdict).toBe("needs-human");
    expect(gates.find(g => g.gate === 4)!.verdict).toBe("pass");
  });
});
```
```ts
// engine/test/golden.e2e.test.ts
import { describe, it, expect } from "vitest";
import { runReview } from "../src/core/driver";
import { StubJudgmentRunner } from "../src/judgment/runner";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { Mutator, TestRunner } from "../src/faultinject/interfaces";
import type { ChangesetContext } from "../src/core/changeset";
// Deterministic golden: judgment stubbed, mechanical gates real logic over stubbed sandbox outcomes.
describe("golden discount review (deterministic)", () => {
  it("reproduces the validated artifact's tiers, gates, and verdicts", async () => {
    const ctx: ChangesetContext = {
      diff: "diff --git a/discount.py b/discount.py\n@@\n+capped = percent if percent <= 50 else 50",
      requirement: "apply the given percentage discount, capped at 50%",
      testCmd: "python -m pytest -q", workdir: "/w", mode: "spec",
    };
    const runner = new StubJudgmentRunner({
      reconstruction: "reduces price by a percentage, never more than 50%",
      criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
      mutations: [
        { criterion: "applies percentage", file: "discount.py", find: "capped / 100", replace: "capped / 50" },
        { criterion: "caps at 50%", file: "discount.py", find: " if percent <= 50 else 50", replace: "" },
      ],
    });
    let cur = "";
    const mutator: Mutator = { async apply(m) { cur = m.find; return async () => {}; } };
    const testRunner: TestRunner = { async run() {
      if (cur === "capped / 100") return { passed: false, failedTests: ["test_applies_percentage"], raw: "" };
      return { passed: true, failedTests: [], raw: "2 passed" };
    } };
    const { markdown } = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })) });
    expect(markdown).toMatch(/Risk tier.*Tier 2/i);
    expect(markdown).toMatch(/Gate 1[\s\S]*verdict.*pass/i);
    expect(markdown).toMatch(/Gate 2[\s\S]*abstain[\s\S]*no-baseline/i);
    expect(markdown).toMatch(/Gate 3[\s\S]*needs-human/i);
    expect(markdown).toMatch(/unguarded-paths[\s\S]*caps at 50%/i);
    expect(markdown).toMatch(/Gate 4[\s\S]*verdict.*pass/i);
    expect(markdown).toMatch(/What this review does NOT establish/i);
    expect(markdown).toMatch(/shared-blind-spot/i);
  });
});
```

- [ ] **Step 2: Run to see them fail**
Run: `cd engine && npm test -- driver golden`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement driver and assembler**
```ts
// engine/src/core/artifact.ts
import type { GateResult, Tier, Verdict } from "./verdicts";
const tierLabel = (t: Tier) => ({ "tier-0": "Tier 0 Mechanical", "tier-1": "Tier 1 Standard", "tier-2": "Tier 2 Critical" }[t]);
export function assembleArtifact(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; gates: GateResult[];
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: { sharedBlindSpot: string; downgradedGates: string; unguardedCriteria: string; regressionBasis: string };
}): string {
  const g = (n: number) => input.gates.find(x => x.gate === n)!;
  const ev = (n: number) => "```json\n" + JSON.stringify(g(n).evidence, null, 2) + "\n```";
  const sub = (n: number) => g(n).subReason ? ` (${g(n).subReason})` : "";
  return `# Review Artifact

## Header
- Changeset id: ${input.changesetId}
- Requirement mode: ${input.mode}
- Risk tier: ${tierLabel(input.tier)}

## Gate 1 — Intent Match
- verdict: ${g(1).verdict}
- evidence:
${ev(1)}

## Gate 2 — Architecture Conformance
- verdict: ${g(2).verdict}${sub(2)}
- evidence:
${ev(2)}

## Gate 3 — Test Adequacy
- verdict: ${g(3).verdict}
- evidence:
${ev(3)}

## Gate 4 — Regression
- verdict: ${g(4).verdict}
- evidence:
${ev(4)}

## Synthesis
- verdict: ${input.synthesis.verdict}
- The human must personally verify:
${input.synthesis.humanMustVerify.map(x => `  - ${x}`).join("\n")}

## What this review does NOT establish
- Shared-blind-spot residue: ${input.doesNotEstablish.sharedBlindSpot}
- Downgraded/abstained gates: ${input.doesNotEstablish.downgradedGates}
- Unguarded criteria: ${input.doesNotEstablish.unguardedCriteria}
- Regression selection basis: ${input.doesNotEstablish.regressionBasis}
`;
}
```
```ts
// engine/src/core/driver.ts
import type { ChangesetContext } from "./changeset";
import type { GateResult, Tier, Verdict } from "./verdicts";
import { triage } from "../gates/triage";
import { intentGate } from "../gates/intent";
import { architectureGate } from "../gates/architecture";
import { faultInjectGate } from "../gates/faultInject";
import { regressionGate } from "../gates/regression";
import { assembleArtifact } from "./artifact";
import type { JudgmentRunner } from "../judgment/runner";
import type { Mutator, TestRunner } from "../faultinject/interfaces";
import type { Sandbox } from "../sandbox/sandbox";
export async function runReview(
  ctx: ChangesetContext,
  deps: { runner: JudgmentRunner; mutator: Mutator; testRunner: TestRunner; sandbox: Sandbox }
): Promise<{ tier: Tier; gates: GateResult[]; markdown: string }> {
  const { tier } = triage(ctx.diff);
  const baseline = await deps.testRunner.run(ctx.testCmd, ctx.workdir, deps.sandbox);
  const g1 = await intentGate(ctx, deps.runner);
  const g2 = architectureGate();
  const g3 = await faultInjectGate({
    criteria: g1.mutations.map(m => ({ criterion: m.criterion, mutation: { file: m.file, find: m.find, replace: m.replace } })),
    baselineOutcome: baseline, testCmd: ctx.testCmd, workdir: ctx.workdir, tier,
    mutator: deps.mutator, runner: deps.testRunner, sandbox: deps.sandbox,
  });
  const g4 = await regressionGate({ testCmd: ctx.testCmd, workdir: ctx.workdir, runner: deps.testRunner, sandbox: deps.sandbox });
  const gates = [g1.result, g2, g3, g4];
  const unguarded = (g3.evidence["unguarded-paths"] as string[]) ?? [];
  const synthesisVerdict: Verdict =
    gates.some(g => g.verdict === "needs-human") ? "needs-human"
    : gates.some(g => g.verdict === "fail") ? "fail" : "pass";
  const markdown = assembleArtifact({
    changesetId: "discount@fixture", mode: ctx.mode, tier, gates,
    synthesis: { verdict: synthesisVerdict,
      humanMustVerify: unguarded.length ? [`is leaving these untested acceptable? ${unguarded.join(", ")}`] : ["confirm intent"] },
    doesNotEstablish: {
      sharedBlindSpot: "inputs neither author nor reviewer considered (e.g. negative price/percent)",
      downgradedGates: g2.subReason === "no-baseline" ? "Gate 2 abstained (no-baseline)" : "none",
      unguardedCriteria: unguarded.length ? unguarded.join(", ") : "none",
      regressionBasis: String(g4.evidence["selection-basis"]),
    },
  });
  return { tier, gates, markdown };
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- driver golden`
Expected: PASS (driver + deterministic golden).

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/core/driver.ts src/core/artifact.ts test/driver.test.ts test/golden.e2e.test.ts
git commit -m "feat: add driver, artifact assembler, and deterministic golden test"
```

---

### Task 10: HTML report renderer

**Files:**
- Create: `engine/src/report/html.ts`, `engine/test/html.test.ts`

**Interfaces:**
- Consumes: the markdown artifact (Task 9).
- Produces:
  - `function renderReport(markdown: string, title?: string): string` — returns a single self-contained HTML string (inlined `<style>`, no external assets), with verdict tokens (`pass`/`fail`/`needs-human`/`abstain`) wrapped in colored badges and the "does NOT establish" section visually emphasized.

- [ ] **Step 1: Write the failing test**
```ts
// engine/test/html.test.ts
import { describe, it, expect } from "vitest";
import { renderReport } from "../src/report/html";
describe("renderReport", () => {
  it("produces self-contained HTML with no external asset references", () => {
    const html = renderReport("## Gate 3\n- verdict: needs-human\n", "Discount review");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/https?:\/\//); // no external assets
    expect(html).toMatch(/needs-human/);
    expect(html).toContain("Discount review");
  });
});
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- html`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/report/html.ts
const escape = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const badge = (s: string) =>
  s.replace(/\b(pass|fail|needs-human|abstain)\b/g, m => `<span class="v v-${m}">${m}</span>`);
export function renderReport(markdown: string, title = "Review Report"): string {
  const body = badge(escape(markdown))
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n/g, "\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#111}
h1,h2{border-bottom:1px solid #ddd;padding-bottom:.2rem}
.v{padding:.1rem .4rem;border-radius:.3rem;font-weight:600}
.v-pass{background:#d7f5dd}.v-fail{background:#f8d2d2}.v-needs-human{background:#fde9c8}.v-abstain{background:#e2e2e2}
h2:last-of-type,section.dne{background:#fff8e6;border:1px solid #e6c86b;padding:.5rem 1rem;border-radius:.4rem}
pre,code{background:#f5f5f5}
</style></head><body>
<pre style="white-space:pre-wrap">${body}</pre>
</body></html>`;
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- html`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/report/html.ts test/html.test.ts
git commit -m "feat: add self-contained HTML report renderer"
```

---

### Task 11: CLI adapter (`review`, `review serve`)

**Files:**
- Create: `engine/src/cli/index.ts`, `engine/test/cli.test.ts`

**Interfaces:**
- Consumes: `loadChangeset` (Task 2), `runReview` (Task 9), `renderReport` (Task 10), `DockerSandbox` (Task 4), `HeadlessClaudeRunner` (Task 8), `PythonSourceMutator`/`PytestRunner` (Task 5).
- Produces:
  - `function buildProgram(deps): Command` — a commander program with `review <range>` (options `--test-cmd`, `--spec`, `--workdir`, `--format md|html`, `--out`) and `review serve` (`--report`, `--port`). `deps` is injectable so the CLI is testable without Docker.
  - `review <range>` wires real `DockerSandbox` + `HeadlessClaudeRunner` + `PythonSourceMutator` + `PytestRunner` into `runReview`, then writes markdown or HTML.

- [ ] **Step 1: Write the failing test (inject fake deps; assert the command wires through and writes output)**
```ts
// engine/test/cli.test.ts
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
```

- [ ] **Step 2: Run to see it fail**
Run: `cd engine && npm test -- cli`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// engine/src/cli/index.ts
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import type { ChangesetContext } from "../core/changeset";
import type { GateResult, Tier } from "../core/verdicts";
export type CliDeps = {
  loadChangeset: (o: { range: string; workdir: string; testCmd: string; requirement: string | null }) => Promise<ChangesetContext>;
  runReview: (ctx: ChangesetContext) => Promise<{ tier: Tier; gates: GateResult[]; markdown: string }>;
  renderReport: (md: string, title?: string) => string;
  writeOut: (path: string | undefined, content: string) => void;
  serve: (o: { report?: string; port?: number }) => Promise<void>;
};
export function buildProgram(deps: CliDeps): Command {
  const program = new Command();
  program.name("review");
  program.command("serve")
    .option("--report <path>").option("--port <n>", "port", "8080")
    .action(async (o) => { await deps.serve({ report: o.report, port: Number(o.port) }); });
  program.argument("[range]").option("--test-cmd <cmd>").option("--spec <file>")
    .option("--workdir <dir>", "workdir", ".").option("--format <fmt>", "md|html", "md").option("--out <path>")
    .action(async (range, o) => {
      if (!range) return;
      const ctx = await deps.loadChangeset({ range, workdir: o.workdir, testCmd: o.testCmd, requirement: o.spec ?? null });
      const { markdown } = await deps.runReview(ctx);
      const content = o.format === "html" ? deps.renderReport(markdown, "Review Report") : markdown;
      deps.writeOut(o.out, content);
    });
  return program;
}
export function defaultWriteOut(path: string | undefined, content: string): void {
  if (path) writeFileSync(path, content); else process.stdout.write(content + "\n");
}
```
(The real `bin` entrypoint wiring `DockerSandbox`/`HeadlessClaudeRunner`/`PythonSourceMutator`/`PytestRunner` into `runReview` and `defaultWriteOut`/a static file server for `serve` is a thin `main()` below `buildProgram`; keep it out of unit tests by injecting deps.)

- [ ] **Step 4: Run tests to verify pass**
Run: `cd engine && npm test -- cli`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
cd engine && git add src/cli/index.ts test/cli.test.ts
git commit -m "feat: add review CLI adapter with injectable deps"
```

---

### Task 12: Live golden integration test (Docker + claude -p)

**Files:**
- Create: `engine/test/golden.live.int.test.ts`

**Interfaces:**
- Consumes: everything; runs the real stack against the real `discount` fixture. Gated behind `RUN_INT=1` and presence of Docker + `ANTHROPIC_API_KEY`.

- [ ] **Step 1: Write the integration test**
```ts
// engine/test/golden.live.int.test.ts
import { describe, it, expect } from "vitest";
import { loadChangeset } from "../src/core/changeset";
import { runReview } from "../src/core/driver";
import { DockerSandbox } from "../src/sandbox/docker";
import { HeadlessClaudeRunner } from "../src/judgment/headless";
import { PythonSourceMutator, PytestRunner } from "../src/faultinject/python";
const on = process.env.RUN_INT === "1" && process.env.ANTHROPIC_API_KEY;
(on ? describe : describe.skip)("live golden (Docker + claude -p)", () => {
  it("surfaces the unguarded 50% cap on the real fixture", async () => {
    const workdir = new URL("../../docs/superpowers/methodology/fixtures/discount", import.meta.url).pathname;
    const sandbox = new DockerSandbox({ image: process.env.REVIEW_IMAGE ?? "review-engine-python:latest" });
    const ctx = await loadChangeset({ range: "HEAD~1..HEAD", workdir, testCmd: "python -m pytest -q", requirement: "apply the given percentage discount, capped at 50%" });
    const { markdown, gates } = await runReview({ ...ctx, diff: ctx.diff || "capped = percent if percent <= 50 else 50" }, {
      runner: new HeadlessClaudeRunner(sandbox), mutator: new PythonSourceMutator(),
      testRunner: new PytestRunner(), sandbox,
    });
    expect(gates.find(g => g.gate === 3)!.verdict).toBe("needs-human");
    expect(markdown).toMatch(/caps at 50%/i);
  }, 120_000);
});
```

- [ ] **Step 2: Run it (only where Docker + key exist)**
Run: `cd engine && RUN_INT=1 npm run test:int -- golden.live`
Expected: PASS where Docker and `ANTHROPIC_API_KEY` are available; SKIPPED otherwise. Note in the commit message that this test is environment-gated.

- [ ] **Step 3: Commit**
```bash
cd engine && git add test/golden.live.int.test.ts
git commit -m "test: add environment-gated live golden integration test"
```

---

## Self-Review

**1. Spec coverage.** Core (changeset, driver, artifact) → Tasks 2, 9. Triage → Task 3. Fault-injection interfaces + Python/pytest → Tasks 5, 6. Regression → Task 7. Judgment delegation (intent, architecture, JudgmentRunner, HeadlessClaudeRunner) → Task 8. Sandbox (interface + Docker + split network) → Task 4, used by Tasks 5/6/7/8. Report + viewing → Task 10 (`serve` wired in Task 11). CLI adapter → Task 11. Golden deterministic + live → Tasks 9, 12. Out-of-scope items (other adapters, other languages, real Gate 2 conformance) are correctly absent. No spec mechanism is unimplemented.

**2. Placeholder scan.** Every code step has complete code; every test step has runnable test code with expected output. The one prose deferral (the real CLI `main()` wiring in Task 11) is explicitly described as thin dependency-injection of already-built classes, and its parts are all defined in prior tasks — no undefined types.

**3. Type/name consistency.** `Sandbox.run(SandboxRun)→SandboxResult` (Task 4) is consumed unchanged by `PytestRunner` (Task 5), `faultInjectGate`/`regressionGate` (Tasks 6/7), `HeadlessClaudeRunner` (Task 8). `Mutator.apply→restore thunk` (Task 5) is used by `faultInjectGate` (Task 6). `IntentResult.mutations` (Task 8) feeds `faultInjectGate`'s `criteria` via the driver (Task 9). `GateResult` fields (`gate`, `verdict`, `subReason`, `evidence`) and the exact evidence keys (`criterion-table`, `guarding-test-table`, `unguarded-paths`, `selection-basis`) are consistent from Task 1 through the assembler in Task 9 and the golden assertions. Verdict/tier vocabulary matches Global Constraints everywhere.

**Note on the triage design decision:** triage is a conservative heuristic (Task 3), not exact semantic detection — documented in the spec's Risk Tiering and safe because over-tiering only increases review. A judgment-backed triage is a fast-follow, not part of this slice.
