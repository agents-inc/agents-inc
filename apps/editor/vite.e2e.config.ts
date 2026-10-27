import { defineConfig, mergeConfig, type UserConfig } from "vite"

import editor from "./vite.config"

// A source file saved mid-run would otherwise be pushed into every open test
// page, re-running its stores and dropping the selection a spec just made.
const WITHOUT_LIVE_RELOAD = { server: { hmr: false } } satisfies UserConfig

export default defineConfig((env) =>
  mergeConfig(editor(env), WITHOUT_LIVE_RELOAD)
)
