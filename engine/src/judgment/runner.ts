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
