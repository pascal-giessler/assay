import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReportRequest } from "../src/cli/index";
import type { ReviewDocument } from "../src/core/reviewDocument";

const doc: ReviewDocument = {
  schemaVersion: 1, changesetId: "discount@fixture", mode: "spec", tier: "tier-2", lang: "en",
  overall: { verdict: "pass" },
  gates: [],
  flow: null,
  synthesis: { verdict: "pass", humanMustVerify: [] },
  doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" },
};

type FakeRes = { code: number; headers: Record<string, string>; body: string | Buffer | undefined };

function makeRes(): FakeRes & { writeHead: (c: number, h: Record<string, string>) => void; end: (b?: string | Buffer) => void } {
  return {
    code: 0,
    headers: {},
    body: undefined,
    writeHead(c, h) { this.code = c; this.headers = h; },
    end(b) { this.body = b; },
  };
}

describe("handleReportRequest", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("renders the dashboard for a valid .json review document", async () => {
    dir = mkdtempSync(join(tmpdir(), "assay-serve-"));
    const p = join(dir, "review.json");
    writeFileSync(p, JSON.stringify(doc));
    const res = makeRes();
    await handleReportRequest(p, res);
    expect(res.code).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/html/);
    expect(String(res.body)).toContain("--bg:#14130f");
    expect(String(res.body)).toContain('class="assay"');
  });

  it("returns 400 for malformed JSON", async () => {
    dir = mkdtempSync(join(tmpdir(), "assay-serve-"));
    const p = join(dir, "review.json");
    writeFileSync(p, "{ not valid json");
    const res = makeRes();
    await handleReportRequest(p, res);
    expect(res.code).toBe(400);
    expect(res.body).toBe("invalid review JSON");
  });

  it("serves a .md file raw", async () => {
    dir = mkdtempSync(join(tmpdir(), "assay-serve-"));
    const p = join(dir, "review.md");
    const text = "# Review\n- verdict: pass\n";
    writeFileSync(p, text);
    const res = makeRes();
    await handleReportRequest(p, res);
    expect(res.code).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(String(res.body)).toBe(text);
  });

  it("returns 404 when the report path does not exist", async () => {
    const res = makeRes();
    await handleReportRequest("/nonexistent/does-not-exist.json", res);
    expect(res.code).toBe(404);
    expect(res.body).toBe("report not found");
  });
});
