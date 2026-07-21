import type { Sandbox } from "../sandbox/sandbox.js";
import type { JudgmentRunner, JudgmentRequest, IntentResult, FlowGraph, FlowNode, FlowEdge } from "./runner.js";
export class HeadlessClaudeRunner implements JudgmentRunner {
  constructor(private sandbox: Sandbox, private opts: { image: string; apiKeyEnv?: string } = { image: "" }) {}
  async intent(req: JudgmentRequest): Promise<IntentResult> {
    const payload = `${req.prompt}\n\n=== EVIDENCE BUNDLE ===\nREQUIREMENT:\n${req.bundle.requirement ?? "(none — inference mode)"}\n\nDIFF:\n${req.bundle.diff}\n\nTEST RESULTS:\n${req.bundle.testResults}\n`;
    // Forward whichever model credential the host holds. A Console API key
    // travels as ANTHROPIC_API_KEY; a Claude Code OAuth token (from
    // `claude setup-token`, prefix sk-ant-oat) travels as
    // CLAUDE_CODE_OAUTH_TOKEN. These are NOT interchangeable — sending an
    // OAuth token as ANTHROPIC_API_KEY makes the API reject it with 401
    // "Invalid API key". Forward each only under its own name.
    const env: Record<string, string> = {};
    const credVars = [this.opts.apiKeyEnv, "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]
      .filter((v): v is string => Boolean(v));
    for (const k of credVars) {
      if (process.env[k]) env[k] = process.env[k] as string;
    }
    const res = await this.sandbox.run({
      command: ["claude", "-p", payload, "--output-format", "json"],
      env, network: true, // judgment needs the model API
    });
    return parseClaudeResult(res.stdout, res.stderr, res.exitCode);
  }
}

function validateFlow(raw: unknown): FlowGraph | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return undefined;
  const kinds = new Set(["entry", "branch", "state", "exit"]);
  const nodes: FlowNode[] = [];
  for (const n of g.nodes) {
    if (!n || typeof n !== "object") return undefined;
    const nn = n as Record<string, unknown>;
    if (typeof nn.id !== "string" || typeof nn.label !== "string" || !kinds.has(nn.kind as string)) return undefined;
    nodes.push({ id: nn.id, label: nn.label, kind: nn.kind as FlowNode["kind"],
      sourceLine: typeof nn.sourceLine === "number" ? nn.sourceLine : undefined,
      criterion: typeof nn.criterion === "string" ? nn.criterion : undefined });
  }
  if (nodes.length === 0) return undefined;
  const ids = new Set(nodes.map(n => n.id));
  const edges: FlowEdge[] = [];
  for (const e of g.edges) {
    if (!e || typeof e !== "object") return undefined;
    const ee = e as Record<string, unknown>;
    if (typeof ee.from !== "string" || typeof ee.to !== "string") return undefined;
    if (!ids.has(ee.from) || !ids.has(ee.to)) return undefined;
    edges.push({ from: ee.from, to: ee.to, label: typeof ee.label === "string" ? ee.label : undefined });
  }
  return { nodes, edges };
}

// The `claude -p --output-format json` output is a result envelope, not the
// reviewer's answer: { type:"result", is_error, api_error_status, result:"<text>" }.
// Surface API/tool errors clearly, then parse the reviewer's IntentResult JSON
// out of the envelope's `result` text (which may be fenced).
export function parseClaudeResult(stdout: string, stderr = "", exitCode = 0): IntentResult {
  const raw = (stdout ?? "").trim();
  if (!raw) throw new Error(`claude -p produced no output (exit ${exitCode}): ${(stderr || "").slice(0, 300)}`);
  const braced = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let envelope: Record<string, unknown>;
  try { envelope = JSON.parse(braced); }
  catch { throw new Error(`claude -p returned non-JSON: ${raw.slice(0, 300)}`); }
  if (envelope.is_error || envelope.type === "error") {
    const detail = String(envelope.result ?? envelope.error ?? "unknown error");
    const status = envelope.api_error_status ? ` (api ${envelope.api_error_status})` : "";
    throw new Error(`claude judgment failed${status}: ${detail}`);
  }
  const text = typeof envelope.result === "string" ? envelope.result : braced;
  const inner = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!inner) throw new Error(`claude judgment returned no JSON object: ${text.slice(0, 300)}`);
  let parsed: IntentResult;
  try { parsed = JSON.parse(inner) as IntentResult; }
  catch { throw new Error(`claude judgment JSON was malformed: ${inner.slice(0, 300)}`); }
  parsed.flow = validateFlow((parsed as { flow?: unknown }).flow);
  return parsed;
}
