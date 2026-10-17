import { setupServer } from "msw/node"

import { defaultHandlers } from "./handlers"

// The one place `msw/node` is named; an instance so `use()` reaches the started server.
export const configMockServer = setupServer(...defaultHandlers)
