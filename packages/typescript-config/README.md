# `@workspace/typescript-config`

Four configs, extended by every workspace in the repository.

| Config               | For                                               |
| -------------------- | ------------------------------------------------- |
| `base.json`          | everything — the options the other three build on |
| `node.json`          | Node programs: `lib` pinned to ES2023, no DOM     |
| `react-library.json` | a library that ships React components             |
| `vite-app.json`      | an app Vite builds                                |

Each file carries `//` comments recording why it says what it says. Those are the argument; this
file is only the rule.

## The rule

**Every workspace either extends one of these four, or records in its own `package.json` why it
does not.** Both halves are checked by `bun run deps:check`, which also asserts that a workspace
bound to these configs declares `@workspace/typescript-config` as a dependency.

The check accepts any route to a shared config, because the repository already uses three: a plain
`extends`, an `extends` **array** (`apps/www` puts Astro's preset on top of `base.json`), a
**relative** base that itself extends one (`packages/cli/tsconfig.scripts.json`), and a
**solution-style** config whose `references` point at the projects that really compile
(`apps/editor`).

## Opting out

Add the key to the workspace's `package.json`, with the reason as its value:

```json
"//no-shared-tsconfig": "Ships plain JavaScript and holds no TypeScript, so there is nothing here for a tsconfig to compile."
```

It lives in `package.json` rather than in a tsconfig because a workspace that opts out often has no
tsconfig at all — the four config packages here are exactly that case. The value is printed by the
check, so the decision is recorded rather than silent.

## Why the rule needs enforcing

`packages/cli/tsconfig.json` extended nothing until 2026-08-06. It restated `target`, `module`,
`strict` and the rest inline and set no `lib`, so `target: ES2022` implied `lib.es2022.full` — DOM
included — and a Node CLI type-checked with `window`, `document`, `name`, `status` and `open` in
scope. A local binding shadowing any of them resolved against the DOM global instead of erroring.

Nothing caught it. `tsc --noEmit` three times, `eslint .`, the unit suite, the e2e suite, `tsup` and
`turbo typecheck` were all green the entire time, because every one of them reads whatever the
config happens to say. **A config that has stopped agreeing with its siblings is invisible to a tool
whose only input is that config.** Comparing workspaces to each other is the only check that can
see it, which is why this one sits beside `syncpack lint` rather than inside any workspace's gates.

The check is `packages/cli/scripts/check-shared-tsconfig.ts`, with its own tests beside it.
