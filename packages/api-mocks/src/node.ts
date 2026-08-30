import { setupServer } from "msw/node"

import { defaultHandlers } from "./handlers"

// The one place `msw/node` is named. Node's server and the browser's worker are
// not interchangeable, so which one a suite gets is decided by the entry point
// it imports rather than by a flag — and a suite that reaches for the wrong one
// fails to resolve rather than failing at run time.
//
// Exported as the instance and not as a factory because `use()` is how a test
// installs a one-off answer, and it has to reach the same server the setup file
// started.
//
// What it serves is `defaultHandlers`, spelled once beside the handlers
// themselves: the signed-in worker is NOT in it, since a browser holding no
// cookie is the resting state and the one every first visit is in. A test that
// wants the other one installs `signedInHandlers` with `use()`.
export const configMockServer = setupServer(...defaultHandlers)
