import { setupServer } from "msw/node"

import {
  catalogHandlers,
  configHandlers,
  skillContentsHandlers,
  skillIndexHandlers,
} from "./handlers"

// The one place `msw/node` is named. Node's server and the browser's worker are
// not interchangeable, so which one a suite gets is decided by the entry point
// it imports rather than by a flag — and a suite that reaches for the wrong one
// fails to resolve rather than failing at run time.
//
// Exported as the instance and not as a factory because `use()` is how a test
// installs a one-off answer, and it has to reach the same server the setup file
// started.
export const configMockServer = setupServer(
  ...configHandlers,
  ...skillIndexHandlers,
  ...catalogHandlers,
  ...skillContentsHandlers
)
