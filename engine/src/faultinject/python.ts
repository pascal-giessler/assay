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
