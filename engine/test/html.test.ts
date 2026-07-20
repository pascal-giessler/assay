import { describe, it, expect } from "vitest";
import { renderReport } from "../src/report/html";

describe("renderReport", () => {
  it("produces self-contained HTML with no external asset references", () => {
    const html = renderReport("## Gate 3\n- verdict: needs-human\n", "Discount review");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/https?:\/\//); // no external assets
    expect(html).toMatch(/needs-human/);
    expect(html).toContain("Discount review");
  });
});
