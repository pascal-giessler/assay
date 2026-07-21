import { describe, it, expect } from "vitest";
import { parseClaudeResult } from "../src/judgment/headless";

const intent = {
  reconstruction: "reduces price by a percentage, capped at 50%",
  criterionTable: [{ criterion: "caps at 50%", status: "met" }],
  mutations: [{ criterion: "caps at 50%", file: "discount.py", find: " if percent <= 50 else 50", replace: "" }],
};

describe("parseClaudeResult", () => {
  it("extracts the IntentResult from the claude result envelope", () => {
    const envelope = JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(intent) });
    const out = parseClaudeResult(envelope);
    expect(out.reconstruction).toContain("capped at 50%");
    expect(out.mutations[0].file).toBe("discount.py");
  });

  it("handles a result wrapped in a markdown code fence", () => {
    const fenced = "Here is the review:\n```json\n" + JSON.stringify(intent) + "\n```";
    const envelope = JSON.stringify({ type: "result", is_error: false, result: fenced });
    expect(parseClaudeResult(envelope).criterionTable[0].criterion).toBe("caps at 50%");
  });

  it("surfaces an API error (e.g. invalid key) with a clear message", () => {
    const envelope = JSON.stringify({ type: "result", is_error: true, api_error_status: 401, result: "Invalid API key · Fix external API key" });
    expect(() => parseClaudeResult(envelope)).toThrow(/claude judgment failed \(api 401\): Invalid API key/);
  });

  it("throws a clear error on empty output instead of a JSON parse crash", () => {
    expect(() => parseClaudeResult("", "boom", 1)).toThrow(/produced no output/);
  });

  it("parses and validates a flow graph in the result", () => {
    const withFlow = { ...intent, flow: {
      nodes: [{ id: "n1", label: "entry", kind: "entry" }, { id: "n2", label: "cap", kind: "branch", criterion: "caps at 50%" }],
      edges: [{ from: "n1", to: "n2" }],
    } };
    const envelope = JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(withFlow) });
    const out = parseClaudeResult(envelope);
    expect(out.flow?.nodes).toHaveLength(2);
    expect(out.flow?.nodes[1].criterion).toBe("caps at 50%");
  });

  it("drops an invalid flow (edge referencing a missing node) without throwing", () => {
    const bad = { ...intent, flow: { nodes: [{ id: "n1", label: "e", kind: "entry" }], edges: [{ from: "n1", to: "ghost" }] } };
    const envelope = JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(bad) });
    expect(parseClaudeResult(envelope).flow).toBeUndefined();
  });
});
