# @workspace/matrix

The skill catalogue: every skill, category, domain, stack and sub-agent the editor can show. It also
holds the wire contracts that more than one workspace reads. It is browser-safe.

| Path                   | What                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `src/vendor/`          | verbatim copies of `packages/cli/src/cli/types/`; generated, never edit              |
| `src/generated/`       | `AGENT_DEFINITIONS`, from the CLI's per-agent `metadata.yaml`; generated, never edit |
| `src/read-model/`      | the catalogue's read models and selection semantics                                  |
| `src/seed.ts`          | a share id's payload (`seedPayloadSchema`, `SEED_VERSION`)                           |
| `src/matrix-schema.ts` | a marketplace's `catalog.json`                                                       |
| `src/skill-index.ts`   | the index the worker serves at `GET /skills`                                         |

Import through the `exports` map in `package.json`, never from `vendor/` or `generated/`.

Regenerate after the CLI's catalogue changes. `bun run generate` here runs `generate:matrix` in
`packages/cli`, and `generate:matrix:check` there reports drift without writing.
