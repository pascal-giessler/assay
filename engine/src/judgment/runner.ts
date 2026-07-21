export type JudgmentRequest = { bundle: { diff: string; requirement: string | null; testResults: string }; prompt: string };
export type FlowNode = {
  id: string;
  label: string;
  kind: "entry" | "branch" | "state" | "exit";
  sourceLine?: number;
  criterion?: string;
};
export type FlowEdge = { from: string; to: string; label?: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export type OverlayStatus = "guarded" | "unguarded" | "unanalyzed";
export type OverlayEntry = { status: OverlayStatus; tests: string[] };
export type FlowOverlay = Record<string, OverlayEntry>;

export type IntentResult = {
  reconstruction: string;
  criterionTable: { criterion: string; status: "met" | "not met" | "not addressed" }[];
  mutations: { criterion: string; file: string; find: string; replace: string }[];
  flow?: FlowGraph;
};
export interface JudgmentRunner { intent(req: JudgmentRequest): Promise<IntentResult>; }
export class StubJudgmentRunner implements JudgmentRunner {
  constructor(private canned: IntentResult) {}
  async intent(): Promise<IntentResult> { return this.canned; }
}
