import { Command } from "commander";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname } from "node:path";
import type { ChangesetContext } from "../core/changeset";
import type { GateResult, Tier } from "../core/verdicts";

export type CliDeps = {
  loadChangeset: (o: { range: string; workdir: string; testCmd: string; requirement: string | null }) => Promise<ChangesetContext>;
  runReview: (ctx: ChangesetContext) => Promise<{ tier: Tier; gates: GateResult[]; markdown: string }>;
  renderReport: (md: string, title?: string) => string;
  writeOut: (path: string | undefined, content: string) => void;
  serve: (o: { report?: string; port?: number }) => Promise<void>;
};

export function buildProgram(deps: CliDeps): Command {
  const program = new Command();
  program.name("review");

  program.command("serve")
    .option("--report <path>")
    .option("--port <n>", "port", "8080")
    .action(async (o) => {
      await deps.serve({ report: o.report, port: Number(o.port) });
    });

  program.argument("[range]")
    .option("--test-cmd <cmd>")
    .option("--spec <file>")
    .option("--workdir <dir>", "workdir", ".")
    .option("--format <fmt>", "md|html", "md")
    .option("--out <path>")
    .action(async (range, o) => {
      if (!range) return;
      const ctx = await deps.loadChangeset({ range, workdir: o.workdir, testCmd: o.testCmd, requirement: o.spec ?? null });
      const { markdown } = await deps.runReview(ctx);
      const content = o.format === "html" ? deps.renderReport(markdown, "Review Report") : markdown;
      deps.writeOut(o.out, content);
    });

  return program;
}

export function defaultWriteOut(path: string | undefined, content: string): void {
  if (path) writeFileSync(path, content);
  else process.stdout.write(content + "\n");
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export function defaultServe(o: { report?: string; port?: number }): Promise<void> {
  const port = o.port ?? 8080;
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reportPath = o.report;
      if (!reportPath || !existsSync(reportPath)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("report not found");
        return;
      }
      const body = readFileSync(reportPath);
      const contentType = MIME[extname(reportPath)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": contentType });
      res.end(body);
    });
    server.on("error", reject);
    server.listen(port, () => {
      process.stdout.write(`Serving ${o.report ?? "(no report)"} on http://localhost:${port}\n`);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const { DockerSandbox } = await import("../sandbox/docker");
  const { HeadlessClaudeRunner } = await import("../judgment/headless");
  const { PythonSourceMutator, PytestRunner } = await import("../faultinject/python");
  const { loadChangeset } = await import("../core/changeset");
  const { runReview } = await import("../core/driver");
  const { renderReport } = await import("../report/html");

  const image = process.env.REVIEW_SANDBOX_IMAGE ?? "review-engine-python:latest";
  const sandbox = new DockerSandbox({ image });
  const runner = new HeadlessClaudeRunner(sandbox, { image });
  const mutator = new PythonSourceMutator();
  const testRunner = new PytestRunner();

  const deps: CliDeps = {
    loadChangeset: (o) => loadChangeset({ range: o.range, workdir: o.workdir, testCmd: o.testCmd, requirement: o.requirement }),
    runReview: (ctx) => runReview(ctx, { runner, mutator, testRunner, sandbox }),
    renderReport,
    writeOut: defaultWriteOut,
    serve: defaultServe,
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
