---
type: convention-drift
severity: medium
affected_files:
  - e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts
  - .ai-docs/agent-findings/2026-07-20-toast-assertions-must-use-cursor-anchored-raw-waits.md
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-06
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: 'CLI-391. The site now presses through `AgentsStep.navigateCursorToAgent` + `toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED)` and the redundant `expect(getOutput()).toContain(...)` is deleted, per assertions.md''s toast rule. Non-vacuity re-proved after the conversion: with the `isActiveGlobal` guard in `toggleAgent` temporarily disabled the spec fails inside `toggleFocusedAgentAwaiting` with `timeout waiting for "Global agents cannot be changed from project scope"`; the guard was restored and `wizard-store.ts` verified byte-identical by sha256 (17e283d3...538ebc). A repo-wide grep for a processed-buffer read within four lines of any toast constant now returns nothing.'
---

<!--
Deliberately NOT linked with `supersedes:` to
`2026-07-20-toast-assertions-must-use-cursor-anchored-raw-waits.md`. TEMPLATE.md rule 3 makes
`supersedes:` / `superseded_by:` a mirrored pair, and the mirror obliges the target to carry
`status: superseded` — which would be false here. That finding's own fix landed and is not
obsolete; this one records a site its sweep could not have covered, because the affordance the
site needed did not exist yet. The relationship is "continues", not "replaces", and the frontmatter
has no key for it, so it is stated in prose below rather than forced into the wrong one.
-->

## What Was Wrong

`2026-07-20-toast-assertions-must-use-cursor-anchored-raw-waits.md` is marked `status: resolved`,
and its `resolved_by` records that `AgentsStep.toggleFocusedAgentAwaiting(sentinel)` "now exists and
is documented as the toast-asserting counterpart of `toggleAgent`". Both halves are true. What the
note does not say is that the one spec which needed it was never converted.

`e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts` asserted the `GLOBAL_AGENTS_LOCKED` toast on
the PROCESSED buffer:

```ts
await agents.toggleAgent(E2E_AGENT_DISPLAY["web-developer"]);
const output = agents.getOutput();
expect(output).toContain(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);
```

This is verbatim the shape the predecessor finding converted away from at four skill-path sites, and
verbatim what `standards/e2e/assertions.md` forbids: "Toasts are always a raw-output assertion …
Use the `*Awaiting` step methods (… `toggleFocusedAgentAwaiting` …)". The standard names the very
method this file declined to call.

The sequencing explains it without excusing it. The 2026-07-20 sweep deliberately did NOT add an
agent-side affordance — its own closing paragraph says "no spec file in this work unit asserts on
those toasts, so no affordance was added — adding one speculatively would be unused code." The
affordance arrived later, with `dual-scope-s-round-trip-space-inert.e2e.test.ts`, which needed it
for the `[P][G]` arm of the same guard. That spec used it correctly. Nobody went back for the
already-existing site covering the OTHER arm of the same guard, emitting the SAME toast constant.

So the drift is not that a rule was unknown. It is that "the affordance now exists" was written into
a `resolved_by` as if it implied "every site now uses it", and no check exists that closes the gap
between those two claims. The convert-the-callers half of a conversion has no runnable gate: the
unconverted site stayed green the whole time, because a processed-buffer toast read fails only when
it loses the render race.

Severity is medium rather than low because of what the assertion was guarding. This is the spec that
pins the project-scope refusal of a globally-installed agent — the CLI-391 claim that the wizard
refuses LOUDLY rather than silently no-opping. An open-loop read is the weakest possible evidence
for a loudness claim: it can pass on a race it did not control, and it can fail on one too.

## Fix Applied

Converted the site, as part of CLI-391:

```ts
await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);
```

The wait IS the assertion, so the trailing `expect(...).toContain(...)` is gone rather than kept
alongside it — assertions.md is explicit that keeping both is redundant.

Two strengthenings landed in the same spec while it was open, both from CLI-391's own brief rather
than from this finding:

- the GLOBAL config is now compared byte-identical instead of by `toContain(agentName)` plus
  `toContain('"scope":"global"')` — two substring checks that a config carrying any global-scoped
  agent satisfies, whether or not the refused one survived;
- the compiled agents at both scopes are compared by CONTENT via a new
  `readCompiledAgents(dir)` helper in `e2e/helpers/test-utils.ts`, not by roster. A rewrite that
  swapped an agent's skills or model leaves `listFiles` identical, so a roster comparison cannot
  see the damage a leaked deselect would actually do.

The global snapshot is guarded by a non-emptiness precondition, because `readCompiledAgents` returns
`{}` for an absent directory and an absent directory would otherwise satisfy the comparison on both
sides — the same vacuity class the predecessor findings on this file keep turning up.

Not fixed: the `status`/`resolved_by` of the predecessor. It is accurate about what it did, and its
deferral was the right call at the time, so it stays `resolved`; this file carries the part it could
not have known. See the frontmatter comment for why the two are not linked with `supersedes:`.

## Proposed Standard

`.ai-docs/agent-findings/README.md` -> "Resolution Model" should require that a `resolved_by` which
records a NEW AFFORDANCE also records the call-site sweep, or names the sites left unconverted and
why:

> When a fix adds a page-object method, helper or matcher that existing sites are meant to adopt,
> `resolved_by:` must state the sweep result — "converted N sites, grep for `<pattern>` returns
> nothing" — or list the sites deliberately left alone. "The affordance now exists" is a claim about
> the toolbox, not about the callers, and a reader of the frontmatter cannot tell which one was
> meant. Where the deferral is deliberate (as the 2026-07-20 sweep's was, correctly, to avoid unused
> code), the finding must stay `partial` until the deferred sites are either converted or recorded
> as not needing conversion — otherwise `resolved` absorbs a known gap.

The runnable half belongs in `.ai-docs/standards/e2e/assertions.md`, beside the existing toast rule:
a grep of a processed-buffer read (`getOutput()` / `getScreen()`) within a few lines of any
`STEP_TEXT` toast constant is a one-line check that would have caught this the day the affordance
landed. It currently returns nothing, so it is adoptable as a gate right now rather than after a
cleanup.
