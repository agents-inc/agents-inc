---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/matrix/matrix-loader.test.ts
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/configuration/config-loader.ts
standards_docs:
  - CLAUDE.md
date: 2026-08-25
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`src/cli/lib/matrix/matrix-loader.test.ts` mocks the module that owns the Zod parse, then asserts
that the loader returned what the mock was handed. Two specs name validation in their titles while
no schema runs in either.

The mechanism, re-derived against source rather than inherited:

- `loadSkillCategories` and `loadSkillRules` in `matrix-loader.ts` do not parse. Each passes a
  schema INTO the collaborator — `await loadConfig(configPath, skillCategoriesFileSchema)` — then
  throws on a falsy result and returns one property off the value.
- `loadConfig` in `configuration/config-loader.ts` is where the validation lives. It owns the
  existence check, the jiti import, the default-export check, and the `schema.safeParse(raw)` whose
  failure becomes a `ConfigSchemaError`.
- The test file mocks that module: `loadConfig: (...args: unknown[]) => mockLoadConfig(...args)`,
  driven by `mockLoadConfig.mockResolvedValue({ ... })`. A `vi.fn()` configured that way accepts the
  schema argument and discards it.

So for the duration of the spec, the code under test reduces to a property access:

```
data = <the object literal written four lines above>
if (!data) throw          // not taken
return data.categories    // the whole of what executes
```

The `toStrictEqual` assertions that follow compare the mock's own input back to itself, minus one
property. For `loadSkillRules` the same shape carries a thirty-line `relationships` object matched
against the thirty-line object the test just supplied, with `relationshipDefinitionsSchema` never
reached.

**Why no gate can see it.** It type-checks, it lints, it passes, and it keeps passing when a field
is retired from the schema — because the schema never runs. With the parse live, a retired field is
stripped and a `toStrictEqual` naming it goes red; with the parse mocked, the field passes straight
through and the assertion matches. The retired `required: true` sitting on BOTH sides of the
`toStrictEqual` was the only visible symptom of this, and it read as an ordinary expected value.
Removing that residue — done by an earlier pass in this programme — deleted the symptom and left the
shape untouched, which is why it is written down here instead.

Worth recording, because it is what makes the class findable rather than the file condemnable: the
same file's other specs are sound. `throws when loadConfig returns null` and `throws when loadConfig
rejects` name the mocked collaborator in their own titles and pin the loader's own null-and-throw
handling, which is genuinely its code. `returns default empty arrays when relationships are missing`
exercises the real `data.relationships ?? { ... }` default. The defect is not "this file mocks too
much" — it is two spec NAMES claiming a behaviour that the mock removed.

## Fix Applied

None — discovery only, and deliberately so. The dispatch that found this was scoped to residue of
the retired category flag; a spec name and a mock boundary are a standards question rather than
residue, and "guards are not features" is a standing ruling here. `matrix-loader.test.ts` is
unchanged by this finding.

Two routes exist for whoever picks it up, and they are not equivalent. Renaming the specs to what
they check (the loader's unwrap-and-default logic) is honest and cheap but buys no coverage. Dropping
the `loadConfig` mock for those two specs and letting a real config file through jiti is what would
make the titles true; the file already fakes a filesystem for `extractAllSkills`, so the fixture
machinery is present.

## Proposed Standard

**A spec whose name claims validation must exercise the validator.** If the module that parses is
mocked, the assertion is a pass-through and the name must say so — or the mock must be dropped for
that spec. Titles like "loads and validates" and "rejects an invalid X" are read by every later agent
as evidence the schema is covered, and that reading is the whole cost: nothing else in the repository
will tell them otherwise.

This belongs in `CLAUDE.md` under **NEVER do this -> Test Assertions**, directly alongside the
existing "NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE". The two are the same
failure at different layers — that rule covers an assertion that passes because of a defect, this one
covers an assertion that passes because the code it names never ran. Cross-checked against the rest
of that section: it conflicts with nothing, and it is not a restatement of the neighbouring
"NEVER define local parser/extractor helpers inside a test file", which is about logic a test adds
rather than logic a mock removes.

**Census, not a sample**, current as of this finding's date. Three test files under `src/cli` mock a
loading or parsing module:

```
grep -rln "vi.mock(.*\(config-loader\|loader\|parse\|schema\)" src/cli --include='*.test.ts' --include='*.test.tsx'
```

Of those three, one has specs whose names claim validation the mock removed — `matrix-loader.test.ts`,
two specs:

```
grep -rn 'it(".*\(validat\|reject\|schema\)' $(grep -rln "vi.mock(.*\(config-loader\|loader\|parse\|schema\)" src/cli --include='*.test.ts' --include='*.test.tsx')
```

The other two are clean, and one of them shows the shape the rule is asking for:
`stacks-loader.test.ts` names a spec "passes through unknown skill IDs for downstream validation and
warns" — a title that states where validation happens and declines to claim it. `local-installer.test.ts`
returns no hits at all.

Re-run both commands rather than reading the figures above; they were true when written.
