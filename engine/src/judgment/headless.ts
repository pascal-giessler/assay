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
