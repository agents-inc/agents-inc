// The package's `exports` has no `types` condition (TS7016), so its ambient module declaration
// is pulled in as a global script; an import would make this file a module and stop that.
/// <reference path="../../node_modules/@lydell/node-pty/node-pty.d.ts" />
