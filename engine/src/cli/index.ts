import { Command } from "commander";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import type { ChangesetContext } from "../core/changeset.js";
import type { GateResult, Tier } from "../core/verdicts.js";
import type { ReviewDocument } from "../core/reviewDocument.js";
import { type Lang } from "../report/i18n.js";

export type PrRef = { range: string; requirement: string | null; title: string };

export type CliDeps = {
  loadChangeset: (o: { range: string; workdir: string; testCmd: string; requirement: string | null }) => Promise<ChangesetContext>;
  runReview: (ctx: ChangesetContext, lang: Lang) => Promise<{ tier: Tier; gates: GateResult[]; markdown: string; document: ReviewDocument }>;
  writeOut: (path: string | undefined, content: string) => void;
  serve: (o: { report?: string; port?: number }) => Promise<void>;
  // Resolve an open GitHub PR to a diff range + requirement. Optional so the
  // base review command stays testable without gh; the `pr` command requires it.
  resolvePr?: (o: { number: string; workdir: string; base?: string }) => Promise<PrRef>;
};

function parseLang(v: string | undefined): Lang {
  if (v === undefined || v === "en") return "en";
  if (v === "de") return "de";
  throw new Error(`--lang must be "en" or "de", got "${v}"`);
}

function parseFormat(v: string | undefined): "json" | "md" {
  if (v === undefined || v === "md") return "md";
  if (v === "json") return "json";
  throw new Error(`--format must be "json" or "md", got "${v}"`);
}

export function buildProgram(deps: CliDeps): Command {
  const program = new Command();
  program.name("assay");

  program.command("serve")
    .option("--report <path>")
    .option("--port <n>", "port", "8080")
    .action(async (o) => {
      await deps.serve({ report: o.report, port: Number(o.port) });
    });

  program.command("pr <number>")
    .description("review an open GitHub pull request (requires the gh CLI)")
    .option("--test-cmd <cmd>", "test command", "python -m pytest -q")
    .option("--workdir <dir>", "a local checkout of the target repo", ".")
    .option("--base <ref>", "base ref to diff against (default: the PR base branch)")
    .option("--format <fmt>", "json|md", "md")
    .option("--out <path>")
    .option("--lang <lang>", "report language: en|de", "en")
    .action(async (number, o) => {
      if (!deps.resolvePr) throw new Error("pr review is not available: resolvePr dependency is not wired");
      const workdir = resolve(o.workdir);
      const lang = parseLang(o.lang);
      const { range, requirement, title } = await deps.resolvePr({ number, workdir, base: o.base });
      const ctx = await deps.loadChangeset({ range, workdir, testCmd: o.testCmd, requirement });
      const res = await deps.runReview(ctx, lang);
      const fmt = parseFormat(o.format);
      const content = fmt === "json" ? JSON.stringify(res.document, null, 2) : res.markdown;
      deps.writeOut(o.out, content);
    });

  program.command("review [range]", { isDefault: true })
    .option("--test-cmd <cmd>")
    .option("--spec <file>")
    .option("--workdir <dir>", "workdir", ".")
    .option("--format <fmt>", "json|md", "md")
    .option("--out <path>")
    .option("--lang <lang>", "report language: en|de", "en")
    .action(async (range, o) => {
      if (!range) return;
      const workdir = resolve(o.workdir);
      const lang = parseLang(o.lang);
      const ctx = await deps.loadChangeset({ range, workdir, testCmd: o.testCmd, requirement: o.spec ?? null });
      const res = await deps.runReview(ctx, lang);
      const fmt = parseFormat(o.format);
      const content = fmt === "json" ? JSON.stringify(res.document, null, 2) : res.markdown;
      deps.writeOut(o.out, content);
    });

  return program;
}

export function defaultWriteOut(path: string | undefined, content: string): void {
  if (path) writeFileSync(path, content);
  else process.stdout.write(content + "\n");
}

// Resolve an open GitHub PR to a review range using the gh CLI. Checks out the
// PR head into the workdir, reads its base branch / title / body, and diffs from
// the merge-base so only the PR's own changes are reviewed. The PR body becomes
// the requirement (spec mode) when non-empty.
export async function defaultResolvePr(o: { number: string; workdir: string; base?: string }): Promise<PrRef> {
  const { execa } = await import("execa");
  const cwd = o.workdir;
  await execa("gh", ["pr", "checkout", o.number], { cwd });
  const { stdout } = await execa("gh", ["pr", "view", o.number, "--json", "baseRefName,title,body"], { cwd });
  const meta = JSON.parse(stdout) as { baseRefName: string; title: string; body: string };
  const base = o.base ?? `origin/${meta.baseRefName}`;
  const mb = await execa("git", ["-C", cwd, "merge-base", base, "HEAD"], { reject: false });
  const baseRef = mb.exitCode === 0 && mb.stdout.trim() ? mb.stdout.trim() : base;
  const requirement = meta.body && meta.body.trim() ? meta.body : null;
  return { range: `${baseRef}..HEAD`, requirement, title: meta.title };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export async function handleReportRequest(
  reportPath: string | undefined,
  res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body?: string | Buffer) => void },
): Promise<void> {
  if (!reportPath || !existsSync(reportPath)) {
    res.writeHead(404, { "content-type": "text/plain" }); res.end("report not found"); return;
  }
  const body = readFileSync(reportPath);
  if (extname(reportPath) === ".json") {
    try {
      const { renderDashboard } = await import("../report/dashboard.js");
      const html = renderDashboard(JSON.parse(body.toString()));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" }); res.end("invalid review JSON");
    }
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(reportPath)] ?? "application/octet-stream" }); res.end(body);
}

export function defaultServe(o: { report?: string; port?: number }): Promise<void> {
  const port = o.port ?? 8080;
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => handleReportRequest(o.report, res));
    server.on("error", reject);
    server.listen(port, () => { process.stdout.write(`Serving ${o.report ?? "(no report)"} on http://localhost:${port}\n`); resolvePromise(); });
  });
}

async function main(): Promise<void> {
  const { DockerSandbox } = await import("../sandbox/docker.js");
  const { HeadlessClaudeRunner } = await import("../judgment/headless.js");
  const { PythonSourceMutator, PytestRunner } = await import("../faultinject/python.js");
  const { loadChangeset } = await import("../core/changeset.js");
  const { runReview } = await import("../core/driver.js");

  const image = process.env.REVIEW_SANDBOX_IMAGE ?? "review-engine-python:latest";
  const sandbox = new DockerSandbox({ image });
  const runner = new HeadlessClaudeRunner(sandbox, { image });
  const mutator = new PythonSourceMutator();
  const testRunner = new PytestRunner();

  const deps: CliDeps = {
    loadChangeset: (o) => loadChangeset({ range: o.range, workdir: o.workdir, testCmd: o.testCmd, requirement: o.requirement }),
    runReview: (ctx, lang) => runReview(ctx, { runner, mutator, testRunner, sandbox }, { lang }),
    writeOut: defaultWriteOut,
    serve: defaultServe,
    resolvePr: defaultResolvePr,
  };

  const program = buildProgram(deps);
  await program.parseAsync(process.argv);
}

const isEntryPoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
