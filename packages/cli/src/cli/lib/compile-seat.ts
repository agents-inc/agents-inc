import { seatDiagnostics } from "@workspace/compile";

import { verbose, warn } from "../utils/logger";

/**
 * Hands `@workspace/compile` this CLI's console; the package runs in a browser and cannot import
 * `utils/logger`. A side-effect import, so a test's `vi.mock` of the logger still reaches the sink.
 */
seatDiagnostics({ warn, verbose });
