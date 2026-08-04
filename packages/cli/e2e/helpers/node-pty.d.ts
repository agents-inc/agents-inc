// `@lydell/node-pty` ships `"exports": "./index.js"` with no `types` condition,
// so TypeScript cannot reach `node-pty.d.ts` through module resolution at all
// (TS7016: "There are types at ... but this result could not be resolved when
// respecting package.json exports"). That file declares an AMBIENT
// `declare module '@lydell/node-pty'`, which only enters the program when it is
// pulled in as a global script — which is exactly what a triple-slash reference
// does. An `import` is not equivalent: `.d.ts` paths cannot be imported, the
// package's single-string `exports` blocks the subpath, and adding any import to
// this file would turn it into a module and stop it contributing globals.
// Verified by deleting this line: 4 TS7016/TS7006/TS7031 errors in
// terminal-session.ts.
//
// `triple-slash-reference` is disabled for `**/*.d.ts` in eslint.config.js rather
// than suppressed here — the idiom is correct for every declaration file, not just
// this one.
/// <reference path="../../node_modules/@lydell/node-pty/node-pty.d.ts" />
