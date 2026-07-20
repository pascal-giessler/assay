import { execa } from "execa";
export type ChangesetContext = {
  diff: string; requirement: string | null; testCmd: string;
  workdir: string; mode: "spec" | "inference";
};
type DiffRunner = (range: string, workdir: string) => Promise<string>;
const gitDiff: DiffRunner = async (range, workdir) => {
  const { stdout } = await execa("git", ["-C", workdir, "diff", range]);
  return stdout;
};
export async function loadChangeset(
  opts: { range: string; workdir: string; testCmd: string; requirement?: string | null },
  runDiff: DiffRunner = gitDiff
): Promise<ChangesetContext> {
  const diff = await runDiff(opts.range, opts.workdir);
  const requirement = opts.requirement && opts.requirement.trim() ? opts.requirement : null;
  return { diff, requirement, testCmd: opts.testCmd, workdir: opts.workdir,
           mode: requirement ? "spec" : "inference" };
}
