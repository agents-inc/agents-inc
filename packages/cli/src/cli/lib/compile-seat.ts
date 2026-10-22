import { seatDiagnostics } from "@workspace/compile";

import { verbose, warn } from "../utils/logger";
import { inertLine } from "../utils/string";

/**
 * Hands `@workspace/compile` this CLI's console; the package runs in a browser and cannot import
 * `utils/logger`. A side-effect import, so a test's `vi.mock` of the logger still reaches the sink.
 *
 * Every compile diagnostic is one line, and some quote a shared link's values, so each arrives
 * inert with its line breaks folded. A diagnostic written across lines would be folded too, and
 * nothing but this sentence says so.
 */
seatDiagnostics({
  warn: (message) => warn(inertLine(message)),
  verbose: (message) => verbose(inertLine(message)),
});
