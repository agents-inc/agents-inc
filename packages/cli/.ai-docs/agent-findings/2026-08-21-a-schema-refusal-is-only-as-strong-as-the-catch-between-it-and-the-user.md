---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/source-fetcher.ts
  - src/cli/lib/content-validator.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The load half landed. `fetchMarketplace` throws `MarketplaceNameRefusedError` for a manifest whose
  `name` the schema refuses, `readManifestState` files it as a fourth `ManifestState` member
  (`refused`), and `resolveMarketplaceLabels` ABORTS on that arm instead of warning — so `search`,
  `init` and `doctor`'s `Marketplace Reachable` row all refuse, and `validateSource` reports the
  manifest as an error against `.claude-plugin/marketplace.json` rather than counting the
  marketplace validated. Pinned by `e2e/commands/marketplace-name-refusal.e2e.test.ts`, which
  carries an accepted-name twin for every leg. What is still open is the SECOND proposed standard,
  which is wider than the name rule: a manifest refused for any OTHER reason (an empty `owner.name`
  is the live shape) is still filed as `unreadable`, still warns, and still reaches no `doctor` row
  of its own. That degrade is deliberate — such a marketplace remains installable, and
  `source-loader.test.ts` -> "a marketplace.json that is absent and one that cannot be read" pins
  it — so widening it is a product decision, not a bug fix.
---

## What Was Wrong

The 2026-08-20 ruling held `marketplaceSchema.name` to `KEBAB_CASE_PATTERN`, and the change is
correct. What no one asked is what a consumer DOES with the refusal, and the answer is: turns it
back into a warning and carries on. The rule is enforced at the schema and discarded at every
reader between the schema and the user, so the tightening is invisible from the outside on the
path a third party's marketplace actually takes.

Measured by hand against the built binary (`bin/run.js`, 0.156.1), a local marketplace whose
`marketplace.json` reads `"name": "Acme_Skills"`:

| Command  | What the user gets                                                                     |
| -------- | -------------------------------------------------------------------------------------- |
| `search` | `Warning: Marketplace has a marketplace.json this CLI cannot read...`, then **exit 0** |
| `doctor` | the same warning, and then `Marketplaces  ✓  1 marketplace validated` on its own row   |

The mechanism is one `catch`. `readManifestState` (`lib/loading/source-loader.ts`) reads absence
off the throw's TYPE and files everything else as `{ kind: "unreadable" }`, which
`resolveMarketplaceLabels` turns into "labelled by its source name". That is right for a manifest
this CLI cannot parse for reasons outside the author's control, and it is exactly wrong for a
manifest it refused on a rule it also publishes under: the load continues into a marketplace whose
name Claude Code will not register plugins under, which is the state the emit-side guard exists to
prevent a user from ever reaching.

The `doctor` row is the sharper half, because `doctor` is the command whose entire job is saying
what is wrong here. `DOCTOR_MARKETPLACE_LOAD_FAILED` ("Failed to load marketplace") exists and is
raised by `checkSourceReachable` — a source that could not be FETCHED. A manifest that was fetched
and refused reaches no check at all, so the Marketplaces row counts it as validated. A green tick
printed under a warning about the same file is worse than no row: the row is the summary a reader
trusts, and it contradicts the line above it.

`2026-08-20-marketplace-name-rule-enforced-on-emit-and-not-on-load` diagnosed the emit/load
asymmetry correctly and stopped at the schema, which was its whole subject. This is deliberately
NOT filed as superseding it: that finding's open half is the rule's PROSE and is untouched by
anything here, and a supersession would retire a live worklist. It is the same rule read one layer
further out — acting on the predecessor alone leaves the rule enforced and unobservable, and
neither finding implies the other.

## Fix Applied

The name half, on 2026-08-21. `MarketplaceNameRefusedError` (`lib/loading/source-fetcher.ts`) is
thrown when the manifest's refusal is about its `name`, decided by `refusesTheName` — which reads
the Zod issue's PATH, never its message, for the same reason `MarketplaceManifestAbsentError` is a
type. `ManifestState` gains a `refused` member and `resolveMarketplaceLabels` throws on it, with the
abort-versus-degrade decision written at that switch. `matrixLoadFailure` in `lib/source-validator.ts`
turns the same throw into an error against `.claude-plugin/marketplace.json`, which is what stops
`doctor` printing a tick beneath its own warning.

The narrowing to the NAME is deliberate rather than incidental: an existing spec pins warn-and-carry-on
for a manifest refused on `owner.name`, and a marketplace with a broken owner block still installs.
The name does not — it is the namespace Claude Code registers every plugin under.

What the pass DID land is the coverage question. `user-journeys.md` journey 33 — the namespace
guards, which already hold the same rule's build side and the id-collision load side — gains the
NAME leg as **TO TEST**, with the note that its discriminating assertion is `doctor`'s row rather
than the warning, because the warning is printed today and the tick beside it is the defect.

## Proposed Standard

**A schema is not enforcement. The narrowest `catch` between the schema and the user is.** When a
validating schema is tightened, the change is not complete until every reader of that schema has
been visited and each has said, at its own call site, whether the new refusal ABORTS or DEGRADES —
the same discipline `CLAUDE.md` § Delegation already requires when a function changes from
returning a sentinel to throwing, and for the identical reason. The 2026-08-20 unreadable-config
ruling did exactly this for `loadSourceConfig`, leaving an `ABORT on...` / `DEGRADE on...` comment
at all ten of its call sites across seven modules; the schema tightening in the same round did not,
and the two changes are the same shape.

The check is one grep per schema and worth running before any `.regex()` or `.min()` lands:

```
grep -rn '<schemaName>' src/cli --include='*.ts' | grep -v '\.test\.'
```

Home: `.ai-docs/standards/clean-code-standards.md`, beside the writer/reader pair rule the
predecessor finding proposed — that rule says the two SIDES of a round trip must agree, and this
one says the refusal has to survive the trip to a user. They are two halves and neither implies
the other.

**And a diagnostic command owes a row for every state it can be handed.** `doctor` splits its
config verdicts three ways — absent, unreadable, valid — precisely so an unreadable file is not
reported as a missing one. Its marketplace verdict has two, fetched and not fetched, and the third
state (fetched and refused) falls into the healthy one. Any check whose subject can fail in a way
its verdict has no value for should say so where the verdict is computed, or the summary lies with
a tick. Home: the `doctor` section of `.ai-docs/reference/commands/index.md`.

Both counts above are a census of the two commands driven, not a sample: `search` and `doctor` are
the two non-installing commands that resolve a marketplace without reading the full config, and
they were driven by hand against the same fixture directory.
