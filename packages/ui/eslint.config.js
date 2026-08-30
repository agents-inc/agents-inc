import { typeCheckedConfig } from "@workspace/eslint-config/base"
import { reactLibraryConfig } from "@workspace/eslint-config/react-library"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  // `storybook build` writes here, and Chromatic runs that build on every
  // publish — so from the first Chromatic run onwards this directory exists on
  // any machine that has published, holding a minified copy of Storybook's own
  // manager bundle. It is gitignored, which is exactly why it needs naming:
  // untracked generated material is not inert, it joins `eslint .` and fails
  // the package until somebody deletes it. Left out, `bun run lint` reports 13
  // errors in `sb-manager/runtime.js` — third-party output nobody here wrote,
  // one of them a missing-rule-definition error against a `@ts-` comment in a
  // file that has no TypeScript in it at all.
  globalIgnores(["storybook-static/**"]),
  ...reactLibraryConfig,
  ...typeCheckedConfig(import.meta.dirname),
])
