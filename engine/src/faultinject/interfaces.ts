import type { Sandbox } from "../sandbox/sandbox";
export type Mutation = { file: string; find: string; replace: string };
export interface Mutator { apply(m: Mutation, workdir: string): Promise<() => Promise<void>>; }
export type TestOutcome = { passed: boolean; failedTests: string[]; raw: string };
export interface TestRunner { run(testCmd: string, workdir: string, sandbox: Sandbox): Promise<TestOutcome>; }
