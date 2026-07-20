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

  it("wraps the 'What this review does NOT establish' section in an emphasized .dne container", () => {
    const html = renderReport(
      "## Gate 3\n- verdict: pass\n## What this review does NOT establish\n- SENTINEL_BULLET_ITEM\n",
      "Discount review"
    );
    const sectionMatch = html.match(/<section class="dne">([\s\S]*?)<\/section>/);
    expect(sectionMatch).not.toBeNull();
    expect(sectionMatch![1]).toContain("What this review does NOT establish");
    expect(sectionMatch![1]).toContain("SENTINEL_BULLET_ITEM");
  });
});
