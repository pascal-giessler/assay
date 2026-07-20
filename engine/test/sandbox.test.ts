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
