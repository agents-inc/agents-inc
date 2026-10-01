# @workspace/matrix

The skill catalog — every skill, category, domain, stack and sub-agent the editor can show.

## Where the data comes from

`src/vendor/` and `src/generated/` are written from `packages/cli`, the CLI package next door in
this repository, by its `scripts/generate-matrix-package.ts` — their single writer. Nothing under
either is authored by hand.

| Path                     | What                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `src/vendor/`            | Verbatim copies of files in the CLI's `src/cli/types/`. **Never edit.** |
| `src/generated/`         | `AGENT_DEFINITIONS`, derived from the CLI's per-agent `metadata.yaml`   |
| `src/built-in-matrix.ts` | Zod boundary for `BUILT_IN_MATRIX`, the vendored catalogue              |
| `src/built-in-agents.ts` | Zod boundary for `AGENT_DEFINITIONS`, the built-in sub-agent roster     |

Regenerate after the CLI's catalog changes — this runs `generate:matrix` in `packages/cli`, and
`generate:matrix:check` there reports drift and writes nothing:

```sh
bun run generate
```

## Entry points

The `exports` map in `package.json` is the list. Import through it, never from `vendor/` or
`generated/`. Beside the catalogue's read models (`src/index.ts`), it carries the wire contracts more
than one workspace reads, each authored here: `seed.ts` (a share id's payload), `matrix-schema.ts`
(a marketplace's `catalog.json`) and `skill-index.ts` (the index the worker serves at `GET /skills`).
