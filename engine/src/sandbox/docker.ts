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
