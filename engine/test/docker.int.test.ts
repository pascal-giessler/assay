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
