import type { GateResult, Tier, Verdict } from "./verdicts.js";
import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";
import type { Lang } from "../report/i18n.js";

export type ReviewDocument = {
  schemaVersion: 1;
  changesetId: string;
  mode: "spec" | "inference";
  tier: Tier;
  lang: Lang;
  overall: { verdict: Verdict };
  gates: GateResult[];
  flow: { graph: FlowGraph; overlay: FlowOverlay } | null;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: {
    sharedBlindSpot: string; downgradedGates: string;
    unguardedCriteria: string; regressionBasis: string;
  };
};

export function assembleReviewDocument(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; lang: Lang;
  gates: GateResult[];
  flow: { graph: FlowGraph; overlay: FlowOverlay } | null;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: ReviewDocument["doesNotEstablish"];
}): ReviewDocument {
  return {
    schemaVersion: 1,
    changesetId: input.changesetId,
    mode: input.mode,
    tier: input.tier,
    lang: input.lang,
    overall: { verdict: input.synthesis.verdict },
    gates: input.gates,
    flow: input.flow,
    synthesis: input.synthesis,
    doesNotEstablish: input.doesNotEstablish,
  };
}
