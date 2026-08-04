---
type: standard-gap
severity: medium
affected_files:
  - e2e/fixtures/expected-values.ts
  - e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts
  - e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts
  - e2e/lifecycle/init-edit-error-guards.e2e.test.ts
  - e2e/lifecycle/scenario-b-edit-home-preserves-projects.e2e.test.ts
  - e2e/lifecycle/scope-aware-local-copy.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  Infra and spec-file adoption both landed — E2E_AGENT exists with the exact shape
  proposed here, and every bare-name literal in the affected spec files now reads
  E2E_AGENT["web-developer"].name. Only the .ai-docs/standards/e2e/README.md rule
  is still unwritten; that file was outside the adopting agent's ownership.
---

## What Was Wrong

`e2e/fixtures/expected-values.ts` gives skills a three-form join —
`E2E_SKILL.<slug>` exposes `.id`, `.slug` and `.display`, so a spec can address
the same skill by config id, by source-path slug, or by the text the wizard
actually renders.

Agents have no equivalent. The two available exports each cover only one form:

- `E2E_AGENT_DISPLAY["web-developer"]` -> `"Web Developer"` (rendered title only)
- `E2E_AGENTS.WEB` -> `["web-developer"] as const` (a `readonly` list, not a
  single name)

There is no shared constant holding the bare agent **name** `"web-developer"`,
which is the form that appears in `config.ts` text, in compiled agent filenames,
and in matcher arguments. So specs keep re-declaring it locally, which is exactly
what CLAUDE.md's "never define text constants locally in E2E test files" forbids:

- `info-panel-scope-toggle-diff.e2e.test.ts` — `const WEB_DEVELOPER_AGENT_NAME = "web-developer"`
- `scenario-b-edit-home-preserves-projects.e2e.test.ts` — `const WEB_DEVELOPER: AgentName = "web-developer"`
- `scope-aware-local-copy.e2e.test.ts` — three bare `toHaveCompiledAgent("web-developer")` literals
- `global-agent-toggle-guard.e2e.test.ts` — a bare `toContain("web-developer")` config-text assertion

The two workarounds both make things worse rather than better:
indexing `E2E_AGENTS.WEB[0]` to reach a single name is less readable than the
literal, and `E2E_AGENTS.WEB` cannot be passed to the builder options that take
`agents?: AgentName[]` at all, because a `readonly` tuple is not assignable to a
mutable array.

The result is a silent asymmetry: a sweep that adopts `E2E_SKILL` everywhere it
applies will still leave every agent-name literal untouched, and the next sweep
will re-propose the same adoption and reach the same dead end.

## Fix Applied

Originally discovery-only: Pass 8 Cluster G phase 2 was strictly behaviour-preserving
spec-file adoption, and `e2e/fixtures/expected-values.ts` was frozen infra owned by
another agent. The `E2E_AGENT_DISPLAY` sweep for the rendered titles passed to
`toggleAgent()` / `navigateCursorToAgent()` was applied where it fits; the name-form
sites were left on their literals rather than adopting a constant whose value does
not match.

**Round 3 (infra half landed).** `E2E_AGENT` was added to
`e2e/fixtures/expected-values.ts` with exactly the shape proposed below, keyed by
`AgentName`, with `display` read from `E2E_AGENT_TITLES` rather than re-typed.
Verified by type probe that `.name` and `.display` both stay literal-typed (no
widening) and that the pre-existing `E2E_AGENTS.WEB_AND_API` getter still infers
`("web-developer" | "api-developer")[]` — the object-level `satisfies` is safe here
only because this object has no accessor, which is noted on-site.

**Round 3 (spec half landed).** Every bare-name site listed above now reads
`E2E_AGENT["web-developer"].name`, and both local re-declarations
(`WEB_DEVELOPER_AGENT_NAME`, `WEB_DEVELOPER`) were deleted rather than reassigned
to the shared constant, per CLAUDE.md's "never reassign constants to other
constants". Two further config-value sites in
`init-edit-error-guards.e2e.test.ts` were swept at the same time. Every swap is
byte-identical — `.name` is a literal-typed `"web-developer"`, so no asserted
string, matcher argument or emitted config byte changed. The `.display` sites were
deliberately left on `E2E_AGENT_DISPLAY`: the rendered title is a different string,
and normalising the two forms into one is exactly what the proposed rule forbids.

Still pending: the standards-doc rule in `.ai-docs/standards/e2e/README.md`.

Correction to the closing note below: swapping `reactMetadata` to
`renderMetadataYaml()` was assumed to change the emitted bytes. It does not. The
hand-written template already matched the renderer's fixed field order
(`author`, `displayName`, `category`, `slug`, `cliDescription`, `usageGuidance`,
`contentHash`) and its quoting, so the swap was proven byte-identical and applied
in round 3. The general caution still stands for sites whose field order differs —
there the emitted bytes really do change, and the swap is only safe when nothing
asserts on the raw metadata text.

## Proposed Standard

Mirror the skill shape for agents in `e2e/fixtures/expected-values.ts`:

```ts
export const E2E_AGENT = {
  "web-developer": { name: "web-developer", display: E2E_AGENT_TITLES["web-developer"] },
  "api-developer": { name: "api-developer", display: E2E_AGENT_TITLES["api-developer"] },
} as const satisfies Partial<Record<AgentName, { name: AgentName; display: string }>>;
```

Then keep `E2E_AGENT_DISPLAY` as-is (it is already a re-export alias and has real
adopters), and let specs use `E2E_AGENT["web-developer"].name` for config-text
assertions, matcher arguments and factory inputs, and `.display` for anything
matched against rendered wizard text.

Document the id-vs-display distinction once, in `.ai-docs/standards/e2e/README.md`
under the shared-fixtures section, as a single rule: **an E2E identity constant
must expose every form the specs address it by, and call sites pick the form —
they never normalise one form into another.** That is the rule that makes both
`E2E_SKILL` and the proposed `E2E_AGENT` self-explanatory, and it is the rule
whose absence let the agent side ship half-built.

Separately worth noting for a future (non-behaviour-preserving) pass:
`scenario-b-edit-home-preserves-projects.e2e.test.ts` builds `reactMetadata` as a
hand-written YAML template string, which CLAUDE.md bans in favour of
`renderMetadataYaml()`. It was left alone here because swapping it changes the
emitted metadata bytes.
