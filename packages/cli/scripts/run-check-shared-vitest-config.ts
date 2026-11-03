/** Entry point for the Vitest half of `bun run deps:check`. */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import {
  check,
  OPT_OUT_KEY,
  SHARED_CONFIG_PACKAGE,
  type WorkspaceVerdict,
} from "./check-shared-vitest-config.ts";
import { isDiverged, repoRootFromArgv, reportDiverged } from "./workspace-manifests.ts";

function summarise(verdicts: WorkspaceVerdict[]): string {
  const count = (outcome: WorkspaceVerdict["outcome"]): number =>
    verdicts.filter((verdict) => verdict.outcome === outcome).length;

  return [
    `  ✓ ${count("bound")} workspaces extend ${SHARED_CONFIG_PACKAGE}`,
    `${count("opted-out")} record why they do not`,
    `${count("no-suite")} run no vitest`,
  ].join(", ");
}

const { clean, verdicts } = check({ repoRoot: repoRootFromArgv(process.argv) });

if (!clean) {
  reportDiverged(verdicts.filter(isDiverged), {
    tool: "Vitest",
    extend: "the config in packages/vitest-config",
    packageName: SHARED_CONFIG_PACKAGE,
    optOutKey: OPT_OUT_KEY,
  });
  process.exit(EXIT_CODES.ERROR);
}

console.log(summarise(verdicts));
