# `@workspace/typescript-config`

The shared tsconfigs. Each file's `//` comments say why its options are set.

| Config               | For                                              |
| -------------------- | ------------------------------------------------ |
| `base.json`          | everything; the options the other three build on |
| `node.json`          | Node programs: `lib` pinned to ES2023, no DOM    |
| `react-library.json` | a library that ships React components            |
| `vite-app.json`      | an app Vite builds                               |

**Every workspace extends one of these, or says in its own `package.json` why it does not:**

```json
"//no-shared-tsconfig": "Ships plain JavaScript, so there is nothing here for a tsconfig to compile."
```

`bun run deps:check` enforces both halves, and also requires a bound workspace to declare
`@workspace/typescript-config`. It accepts a plain `extends`, an `extends` array (`apps/www`), a
relative base (`packages/cli/tsconfig.scripts.json`) and a solution-style config (`apps/editor`).
Deleting a tsconfig does not exempt a workspace; only the key does. The check is
`packages/cli/scripts/check-shared-tsconfig.ts`.
