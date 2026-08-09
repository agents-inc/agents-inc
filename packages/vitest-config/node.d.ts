import type { ViteUserConfig } from "vitest/config"

// `node.js` beside this file is plain JavaScript. Without a declaration, every
// consumer's own `tsc --noEmit` fails on TS7016 the moment its vitest.config.ts
// imports from here, and the only way past it is `allowJs: true` in that
// workspace's tsconfig. Three workspaces set it, each with its own wording of
// the same explanation, before this file existed.
//
// The type is Vitest's own rather than the literal shape of the object next
// door, and that is what stops this from rotting: a setting added, removed or
// changed in `node.js` does not touch this file. Only renaming the export would
// — and that breaks every consumer's import in the same commit.
export declare const nodeConfig: ViteUserConfig

export default nodeConfig
