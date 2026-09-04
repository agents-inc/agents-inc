---
type: missing-standard
severity: medium
affected_files:
  - src/agents/_templates/agent.liquid
  - src/cli/lib/schemas.ts
  - src/cli/lib/agents/agent-plugin-compiler.ts
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/types/agents.ts
  - e2e/helpers/test-utils.ts
  - e2e/helpers/handrun.gen.mjs
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-09-03
reporting_agent: cli-tester
category: typescript
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The code half landed hours after this was filed, in the lane that owned `schemas.ts`, and
  independently of it — `agentFrontmatterValidationSchema` now carries
  `isolation: agentIsolationSchema.exactOptional()` and
  `experimental: agentExperimentalSchema.strict().exactOptional()`, with the sub-object's
  `.strict()` this finding warned was easy to drop. The two key rosters are now equal; re-derive
  with the pair of commands in the body. Two halves are still open. The ENFORCEMENT half, which is
  the finding's actual subject: nothing holds the template's emitted keys against the schema's, so
  the next key added to one side and not the other fails exactly as these two did — the spec named
  below pins these two keys and not the roster. And one residue in `src/cli/types/agents.ts`:
  `AgentFrontmatter` still declares no `experimental`, so the type now understates both the schema
  beside it and the template above it.
---

## What Was Wrong

`src/agents/_templates/agent.liquid` writes eleven keys into a compiled sub-agent's YAML
frontmatter. `agentFrontmatterValidationSchema` in `src/cli/lib/schemas.ts` is `.strict()` and names
nine of them. The two it does not name are `isolation` and `experimental` — the two the template
emits from its own conditional branches.

Both rosters are derivable, and the pair of commands is the census rather than a sample of it:

```
sed -n '2,14p' src/agents/_templates/agent.liquid | grep -oE '(^|\{%[^%]*%\})[a-zA-Z]+:' | sed -E 's/.*\}//' | tr -d ':' | sort -u
bun -e 'import { agentFrontmatterValidationSchema } from "./src/cli/lib/schemas.ts"; console.log(Object.keys(agentFrontmatterValidationSchema.shape).sort().join("\n"))'
```

Run 2026-09-03, the difference between the two outputs is exactly `isolation` and `experimental`, so
the class is two keys and has no further members.

Two production readers parse compiled frontmatter through that schema —
`validateAgentFrontmatter` in `src/cli/lib/plugins/plugin-validator.ts` and
`parseAgentFrontmatter` in `src/cli/lib/agents/agent-plugin-compiler.ts`, found with
`grep -rln "agentFrontmatterValidationSchema" src e2e`, whose output is this finding's
`affected_files` list (`handrun.gen.mjs` is generated and `test-utils.ts` re-exports; neither is a
reader). Because the schema is strict, an unnamed key is not ignored — it is a refusal. So an agent
carrying either key is reported as invalid frontmatter by `validate`, and `compileAgentPlugin`
returns `null` and throws on the agent it was asked to package.

**It is one missed site in a change still in the working tree, not an old latent gap**, which is
what makes it worth writing down. `git diff HEAD` on 2026-09-03 shows the same uncommitted change
adding `agentIsolationSchema` and `agentExperimentalSchema`, adding the template's two branches
(neither key was emitted at HEAD), and wiring the two schemas into three of the four places that
needed them. `grep -n "permissionMode:" src/cli/lib/schemas.ts` is the census of agent-shaped
schemas and returns exactly three:

| Site                               | Reached by the change |
| ---------------------------------- | --------------------- |
| `agentYamlConfigSchema`            | yes                   |
| `agentYamlGenerationSchema`        | yes                   |
| `agentFrontmatterValidationSchema` | **no**                |

`src/schemas/agent.schema.json` is the fourth and was regenerated with both keys. So one site of
four was missed, and it is the only one that reads a COMPILED agent back.

Two further disagreements the same change left behind, both in files this pass did not own:

- `AgentFrontmatter` in `src/cli/types/agents.ts` declares `isolation?: AgentIsolation` on the very
  shape being refused, so the type and the schema over one artefact contradict each other. It
  declares no `experimental` at all, while `BaseAgentFields` beside it gained one.
- The refusal is reachable from outside this repository. The CLI must consume anything the editor
  can produce (CLAUDE.md, "The CLI is deliberately narrower than the editor"), and `types/matrix.ts`
  documents both vocabularies expressly so a browser render spells them the way the CLI does — so an
  agent authored elsewhere with `experimental: { cacheTtl: "1h" }` is a legal payload this CLI
  refuses to install.

It is latent rather than live: `grep -rln "^isolation:\|^experimental:" src/agents/*/*/metadata.yaml`
returns nothing, so no agent this repository ships declares either key and nothing has had occasion
to report it. The severity is `medium` for that reason and not because the failure is soft — when it
does fire, `compileAgentPlugin` throws a message reading "Required fields: 'name' and 'description'"
about a file that has both, which sends the reader to the wrong two keys.

## Fix Applied

None — discovery only, and deliberately: this pass owned one spec file and not `schemas.ts`.

The defect is pinned by
`src/cli/lib/__tests__/agent-frontmatter-schema-accepts-the-keys-the-template-emits.test.ts`, whose
six cases were watched fail before being reported. Four are red today and two are the controls that
must stay green through the fix — one asserting the fixture parses without either key, one asserting
an unrelated unknown key is still refused.

**The `.strict()` on the sub-object is load-bearing and is easy to drop.** `agentExperimentalSchema`
is declared without one, and `agentYamlGenerationSchema` applies `.strict()` at its own use site. A
fix writing `experimental: agentExperimentalSchema.exactOptional()` accepts the two acceptance cases
and silently strips a mistyped option name, so an agent asking for `cacheTtlSeconds` would compile
carrying no cache setting and no complaint. That is the case the sixth test exists to hold.

## Proposed Standard

**The rule.** Where one artefact is written by a template and read back by a schema, the key rosters
are held against each other by a gate rather than by two authors remembering. A Liquid template is a
string `tsc` never opens and ESLint does not lint, so a key added to one side and not the other
fails at runtime, in a command, on a file nobody in this repository has yet written.

**And the reason a gate rather than a checklist**: the author of the in-flight change did remember,
three times out of four. Nothing about the fourth site looks different from the others — it sits in
the same file, twelve lines below one it updated, with the same `permissionMode` line in it — so
what failed is attention on a repetitive edit, which is the failure mode a checklist shares and a
gate does not.

**Where it goes.** `.ai-docs/standards/typescript-types-bible.md`, beside the existing material on
holding a stated roster against a generated one. It is the same shape as the rule
`src/cli/lib/__tests__/agent-template-reads-its-model.test.ts` already enforces on the model side —
that gate holds the template's `agent.*` lookups against `Required<AgentConfig>`, for word-for-word
this reason, and the frontmatter keys it EMITS were simply never the subject of one. The proposed
gate is its sibling: extract the frontmatter block's keys and assert they are a subset of
`Object.keys(agentFrontmatterValidationSchema.shape)`.

**Cross-checked** against CLAUDE.md's NEVER/ALWAYS rules and it conflicts with none. It is the
positive form of "NEVER assert a directory listing, roster or generated union by count alone" — two
rosters, compared by members. Note for whoever writes it: the extractor belongs in
`src/cli/lib/__tests__/helpers/` with its own test, not inline in a spec, because reading keys out of
Liquid is exactly the non-trivial scan CLAUDE.md's "NEVER define local parser/extractor helpers
inside a test file" is about — `helpers/template-field-reads.ts` is the precedent, and its docblock
records why splitting the reader from the gate is what makes the question answerable.

## Correction

**The code half landed while this pass was still running**, in the lane that owned `schemas.ts` and
with no knowledge of this filing. Appended rather than rewritten above, per the directory's rule
that a body is dated evidence: every claim in "What Was Wrong" was true when measured, and the
2026-09-03 working tree it describes is what the spec was watched fail against.

What changed, re-derived after the fact: `agentFrontmatterValidationSchema` now names both keys,
with `agentExperimentalSchema.strict()` on the sub-object — the exact shape this finding warned was
easy to omit, arrived at independently. The two key rosters the body's commands produce are now
equal at eleven members each, and all six cases of the spec pass.

**That does not close this finding, and the reason is the whole point of filing it.** The subject is
the absent gate, not the two keys: nothing in the tree holds the template's emitted frontmatter keys
against the schema that reads them, so the twelfth key will fail the way these two did. The spec
pins these two by name and is not that gate. One residue is also still open, in
`src/cli/types/agents.ts` — `AgentFrontmatter` declares no `experimental`, so the type now
understates the schema declared beside it and the template that writes the file it describes.

**Worth recording about the fix itself**: the two lanes agreed on `.strict()` for the sub-object
without coordinating, which is evidence the call was right rather than evidence it was safe. Nothing
would have reported the looser version — it accepts every case the strict one does and differs only
on a mistyped option name, which is the input nobody writes on purpose.
