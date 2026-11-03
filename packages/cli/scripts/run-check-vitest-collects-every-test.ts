/** Entry point for the test-collection half of `bun run deps:check`. */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, type WorkspaceVerdict } from "./check-vitest-collects-every-test.ts";
import { repoRootFromArgv } from "./workspace-manifests.ts";

function reportUncollected(verdicts: WorkspaceVerdict[]): void {
  console.error(
    "Test files their workspace's Vitest config does not collect, so they never run:\n",
  );

  for (const { workspace, uncollected } of verdicts) {
    if (uncollected.length === 0) continue;

    console.error(`  ${workspace}`);
    for (const file of uncollected) {
      console.error(`    ${file}`);
    }
  }

  console.error(
    [
      "",
      "Add an include pattern reaching each file to its workspace's vitest.config,",
      "or move the file under a pattern that already does.",
    ].join("\n"),
  );
}

function summarise(verdicts: WorkspaceVerdict[]): string {
  const collected = verdicts.reduce((total, verdict) => total + verdict.collected.length, 0);

  return `  ✓ ${collected} test files outside e2e/ in ${verdicts.length} workspaces are collected by their Vitest config`;
}

const { clean, verdicts } = await check({ repoRoot: repoRootFromArgv(process.argv) });

if (!clean) {
  reportUncollected(verdicts);
  process.exit(EXIT_CODES.ERROR);
}

console.log(summarise(verdicts));
