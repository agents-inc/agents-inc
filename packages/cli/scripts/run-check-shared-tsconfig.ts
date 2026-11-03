/** Entry point for the TypeScript half of `bun run deps:check`. */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, OPT_OUT_KEY, SHARED_CONFIG_PACKAGE } from "./check-shared-tsconfig.ts";
import { isDiverged, repoRootFromArgv, reportDiverged } from "./workspace-manifests.ts";

const { clean, verdicts } = check({ repoRoot: repoRootFromArgv(process.argv) });

if (!clean) {
  reportDiverged(verdicts.filter(isDiverged), {
    tool: "TypeScript",
    extend: "one of the configs in packages/typescript-config",
    packageName: SHARED_CONFIG_PACKAGE,
    optOutKey: OPT_OUT_KEY,
  });
  process.exit(EXIT_CODES.ERROR);
}

const bound = verdicts.filter((verdict) => verdict.outcome === "bound");
const optedOut = verdicts.length - bound.length;

console.log(
  `  ✓ ${bound.length} workspaces extend ${SHARED_CONFIG_PACKAGE}, ${optedOut} record why they do not`,
);
