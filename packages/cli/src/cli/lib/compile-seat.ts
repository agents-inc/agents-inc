import { seatDiagnostics } from "@workspace/compile";

import { verbose, warn } from "../utils/logger";

/**
 * Hands `@workspace/compile` this CLI's console.
 *
 * Two of the things that moved into that package still have something to tell a user:
 * `sanitizeLiquidSyntax` reports a stripped template delimiter, and
 * `generateProjectConfigFromSkills` reports a selected id this marketplace does not carry. The
 * package cannot import `utils/logger` — it has to run in a browser — so the sink is seated
 * instead, and its default there discards, which is the honest answer for a preview with no
 * console.
 *
 * A side-effect import, and the modules that own the seated functions are the ones that take it:
 * `compiler.ts` and `configuration/config-generator.ts`. That is what keeps a unit test's
 * `vi.mock("../utils/logger")` in force — the mock resolves to the same module this file imports,
 * so the sink holds the spy rather than the real writer.
 */
seatDiagnostics({ warn, verbose });
