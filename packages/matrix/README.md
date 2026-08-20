# @workspace/matrix

The skill catalog — every skill, category, domain, stack and sub-agent the editor can show.

## Where the data comes from

Copied out of `packages/cli`, the CLI package next door in this repository. Nothing here is authored by hand.

| Path                     | What                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `src/vendor/`            | Verbatim copies of the CLI's `src/cli/types/`. **Never edit.**             |
| `src/generated/`         | `AGENT_DEFINITIONS`, derived from the CLI's per-agent `metadata.yaml`      |
| `src/built-in-matrix.ts` | Zod boundary for `BUILT_IN_MATRIX`, the vendored catalogue                 |
| `src/built-in-agents.ts` | Zod boundary for `AGENT_DEFINITIONS`, the built-in sub-agent roster        |
| `src/index.ts`           | The public API. `apps/editor` imports from here only, never from `vendor/` |

Regenerate after the CLI's catalog changes:

```sh
bun run generate                                # reads ../cli, no setup
AGENTS_INC_CLI=/path/to/cli bun run generate    # the exception: a checkout elsewhere
```

## Why it's a copy

The CLI plans to publish this as `@agents-inc/skills-matrix` (see its `todo/D-239`). Until it does, we
vendor. Keeping `vendor/` byte-identical to the CLI makes that swap a delete plus a dependency bump.
`src/generated/agents.ts` is the one thing the CLI does not yet generate — it is the gap D-239 names.
