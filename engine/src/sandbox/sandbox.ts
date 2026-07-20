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
