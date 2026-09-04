---
last_validated: 2026-08-06
---

# Documentation Bible -- Agents Inc. CLI

> Standards for creating and maintaining AI-optimized documentation in `.ai-docs/`.
> Consult this file only when creating or updating documentation.

---

## The Governing Rule

`.ai-docs/` exists to give an agent the **actual current state** of the app: its architecture, its
invariants, where things live, and what rules they obey. It is not a record of the work that
produced that state.

**The paragraph test — apply it to every paragraph you write or keep:**

> Does an agent implementing a feature tomorrow need this to be correct, or is it a record of
> somebody having been correct in the past?

Keep the first. Cut the second.

An invariant of the system is state and belongs — "every Ink render goes through
`src/cli/components/render.ts`" is architecture. The chronology of how it got that way is history
and does not: the date it landed, the pass that documented it, the task ID that drove it, what an
earlier version of the document used to claim, what a previous pass got wrong.

**`git log` is the archive.** The commit messages already carry the why at the moment each decision
was made, frozen to their commit and therefore never stale. Do not open a decision log, a changelog
section or a validation history to give the clutter somewhere to live.

### Four rules that follow from it

1. **No pass narration.** A document never records what a pass did, checked, corrected or found.
   No `corrected 2026-08-06`, no "this section previously said X", no "a prior audit claimed Y", no
   "verified this session".

2. **State the fact, not the diff.** Write `retry` is `1`, not "`retry` was `2` and is now `1`".
   The superseded value survives only where knowing it prevents a live mistake — a trap an agent
   will actually walk into (a stale global install shadowing the local build; two copies of React
   in one tree; an import whose hoisting order matters). There the history **is** the warning.
   Everywhere else — a "was" column, a superseded count, a renamed symbol nobody references — cut
   it.

3. **No task IDs, live or dead.** An ID absent from `todo/repo.md` and `todo/cli.md` is dead and
   means nothing to a reader; a live one is no safer, because it may already be unresolvable or
   ambiguous. `D-266` is an open row whose ID appears in no file under `src/`, `e2e/` or `scripts/`,
   so a reader has nothing to grep for, and `D-278` was renumbered after a collision, so one ID now
   names two rows. Name the behaviour instead of the ticket that produced it. An ID may appear only
   where it is the subject rather than the provenance — quoted as a specimen of this rule, or in
   `agent-findings/` and `agent-suggestions/`, both of which are dated evidence by design: an entry
   in either is referenced by filename, keeps its status in frontmatter, and is never moved once
   written.

   **The exemption reaches the two directories through different halves of an entry, so a clause
   naming one of them exempts half the artefact.** In `agent-findings/` the IDs sit in filenames
   and frontmatter, where they are the record's own identity. In `agent-suggestions/` they sit in
   the BODY, where a proposal argues FROM them —
   `agent-suggestions/2026-07-30-identity-key-helper-export-exception.md` makes its case for the
   identity-key helper convention by naming the two defects that produced it, and substituting
   behaviour for those IDs would leave the argument resting on nothing. The census command below
   excludes both directories for that reason; widening one exclusion without the other enforces a
   rule this clause does not state.

   **The tree does not pass this rule, and it fails on both halves — source files and documents
   alike.** Two greps are the inventory; read the scale off them rather than off this page, and use
   path exclusions rather than a `grep -v` pipe — `grep -rn` prints `path:line:text`, so a pipe
   filters the matched text as though it filtered the path and will report a clean tree over live
   drift.

   ```
   grep -rnP '\b[A-Z]{1,4}-[0-9]{2,4}\b' src/ e2e/ scripts/ --include='*.ts' --include='*.tsx'
   grep -rnP '\b[A-Z]{1,4}-[0-9]{2,4}\b' .ai-docs/ --include='*.md' \
     --exclude-dir=agent-findings --exclude-dir=agent-suggestions --exclude=documentation-bible.md
   ```

   `SHA-256` is the only non-ID token these match; every other hit is an offender. Neither returns
   empty, and several of the document hits are section HEADINGS, whose replacement moves every
   anchor pointing at them — so closing this class is a planned sweep, not a drive-by. **A sweep
   scoped to whatever single site a sentence names** fixes that one, re-greps for that one ID, finds
   it clean and reports the class closed. The greps are the worklist; no sentence here substitutes
   for running them.

4. **Staleness is one line of frontmatter, and nothing else.** See below.

### The current-state rule reaches the guides in `apps/www`

Everything above is written for `.ai-docs/`, whose readers are agents that will open the source
anyway — a false sentence there costs a grep. `apps/www/src/content/docs/` is read by marketplace
authors and CLI users who **cannot** check, so a false sentence there is a defect in the product.
The asymmetry runs the wrong way from the effort: the documents with the weaker guarantee have the
readers with no recourse.

**A guide sentence claiming a command refuses, validates, rejects or enforces something must name
the command and be traceable to a call site.** Where the behaviour is intended but unbuilt, write it
in the future tense and carry the tracker row; do not describe it in the present tense as an
aspiration, because aspirational prose is indistinguishable from a description of shipped behaviour.
`creating-a-marketplace.md` asserted that `build marketplace` "enforces this — a skill whose id does
not carry the prefix fails the build", and nothing compared the two: an author who read the guide,
followed the convention and slipped on one id got exit 0, a written `marketplace.json` and a
collision on a consumer's machine. A convention with no validator is a known cost; a convention with
documentation asserting a validator that does not exist is worse than an undocumented one, because
it turns the author's correct behaviour — reading the docs and trusting them — into the thing that
hides the defect. `validateMarketplaceName` and `validateSkillIdNamespace` in
`src/cli/lib/marketplace-generator.ts`, both called from `src/cli/commands/build/marketplace.ts`,
are what made that paragraph true.

The worklist is every enforcement verb in the guides, read against the command it names:

```
grep -rnP '\b(enforces?|refuses?|rejects?|validates?|requires?|will fail)\b' \
  ../../apps/www/src/content/docs/docs/
```

---

## Core Principles

**1. Document from files you have opened.** Every claim comes from file contents you read.

**2. Structure for a reader that parses.** Tables, explicit paths, code blocks — the reference a
model needs, rather than a tutorial or an explanation of a general concept.

**3. Verify every path and symbol against source**, and cite by symbol; line numbers move and the
citation rots with them.

**4. Re-read a file after editing it** and confirm the change is present before reporting the work
done.

Principles 1 and 4 are also rendered into every compiled agent by
`src/agents/_templates/methodologies/operating-principles.liquid` — they are stated here because
this document is read by people and by lanes that are not compiled agents. An agent's own files
need not restate them; the census of agents that still do is
`grep -rlE '\*\*\(You MUST|→ STOP|## CRITICAL' src/agents/*/*/*.md`.

**5. Progressive Loading** — load `DOCUMENTATION_MAP.md` first, then only the documents you need.

---

## Staleness

Every document carries exactly one staleness signal, in its frontmatter:

```yaml
---
last_validated: YYYY-MM-DD
---
```

Binding rules:

1. **It means the whole document was re-derived from source on that date.** Nothing narrower.
2. **A pass that checked part of a document does not move it.** Correct what you found, leave the
   date. Moving it would report the sections nobody opened as freshly checked — those are the ones
   most likely to be wrong.
3. **No annotation blocks anywhere.** No HTML-comment validation banners, no `FULL` / `PARTIAL`
   markers, no `✓ / ✗` scope lists, no `**Last Validated:**` line in the body. The frontmatter date
   is the entire mechanism.
4. **A pointer's date records link integrity**, not source validation — the last time its redirect
   targets were confirmed to resolve. A pointer lagging its targets is the expected steady state.
   Do not re-stamp a pointer you did not open, and do not churn one to the current date.
5. **If you leave a named area of a document knowingly unverified and it matters, file it in
   `agent-findings/`.** That is the home for dated point-in-time evidence; a document is not.
6. **Every count the document owns must have been re-derived from source in that same pass.**
   This is the one mechanical, checkable half of rule 1, and it is where the date is most often
   advanced falsely: a pass that moved three figures and stamped the date reports the other four as
   checked. Counts are the cheapest claims in any document to re-derive — read the tuple, run the
   test file, evaluate the module — so there is no version of "I re-derived this document" that
   skips them. If you touched some counts and not others, correct what you found and **leave the
   date**; the document is then honestly stale rather than falsely fresh. See
   [A Count Lives in Exactly One Document](#a-count-lives-in-exactly-one-document) for which counts
   a document owns. The case that produced this rule: `built-in-catalogue.md` carried
   `conflicts: 28` against 12 and `requires: 50` against 98 under a `last_validated` stamped that
   same day. `alternatives: 42` was correct, and the wrong figures were exactly the ones an earlier
   partial pass had moved — the pattern of which counts drifted names its own cause.

Thresholds — how long a date may age before the document is due for a whole-file pass:

| Document class                                                  | Threshold |
| --------------------------------------------------------------- | --------- |
| `reference/store-map.md` (tracks the highest-churn source file) | 7 days    |
| Reference documents generally                                   | 14 days   |
| Low-churn areas (architecture, packaging, monorepo, pointers)   | 30 days   |
| `standards/`                                                    | Quarterly |

---

## The Map

`DOCUMENTATION_MAP.md` is an **index**: which documents exist and what each one covers. It is read
before the documents it describes, so anything wrong in it is authoritative for every agent that
never opens the owning doc.

- It does **not** restate `last_validated` dates — frontmatter owns them, and a second copy can
  only drift.
- It does **not** record passes, closed gaps, completed work or its own audit history.
- Adding a document means adding a row; deleting one means deleting the row.

---

## A Count Lives in Exactly One Document

Annotations in an index, a tree diagram or a "covers" column describe **scope**, never
**quantity**.

```
GOOD: zod-schemas.md   # Zod schemas (bridge, loader, structural, strict)
BAD:  zod-schemas.md   # All 39 Zod schemas (bridge, loader, structural, strict)
```

A count belongs in **one** place: the document that re-verifies it against source. A second copy
guarantees drift, because validation is organised per document — the agent assigned
`zod-schemas.md` re-counts the schemas and nothing tells it that another file quotes the same
number.

| Count                                                                     | Owning doc (the ONLY place the number is written)            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Zod schema count                                                          | `reference/types/zod-schemas.md`                             |
| `SkillId` / `SkillSlug` / `Category` / `Domain` / `AgentName` union sizes | `reference/type-system.md` ("Counts")                        |
| `defaultCategories` size + `exclusive: true` count                        | `reference/features/skills-and-matrix.md` ("Current Counts") |
| Factory / helper / assertion counts                                       | `reference/testing/factories.md`                             |
| How many source files and E2E files there are                             | `DOCUMENTATION_MAP.md` ("Coverage")                          |
| Packaging counts (tarball entries, entry globs)                           | `reference/build-and-packaging.md`                           |

Everything else names the owning doc instead of restating the number. **When a pass changes a
count, grep `.ai-docs/` for both the old and the new value before finishing.** If a stale copy is
outside your ownership, record the mismatch in a file you do own and report it.

**Ownership is decided by the SUBJECT, not by the granularity — a count the owning document
expresses as an aggregate is still owned when another document expresses it per-directory,
per-category or per-scope.** The row above said "totals" and was read as a rule about two specific
numbers rather than about the quantity of files, so four per-directory annotations in one tree
diagram sat outside it: a reader checking "is this restated anywhere?" compares 57 against 266,
finds no collision, and concludes the annotation is that document's own. It is the same count
sliced finer, and the bullet directly above forbids the shape independently.

**Three of those four were right on the day, and that is the part worth carrying.** A rule violated
four times and visibly wrong once reads as a single stale figure to correct rather than as four
copies to delete — and correcting the one is exactly what leaves the other three to drift later. So
when a count is found stale, the finding is not the number; it is every copy of that count at every
granularity.

**The same rule governs membership, not just the total.** A list introduced by "exhaustive", "all
N", or "no other X is exported from it" is a claim about source, re-derivable in one command — so
re-derive it in the same pass as the count and diff in **both** directions. The two directions are
not the same size. A list that is short sends a reader looking for a member, failing to find it, and
writing a duplicate; a list naming a symbol the source has since lost sends them grepping for
nothing, after which the whole file stops being trusted. Two lists can agree on a total and share no
names at all. `scripts/check-enumeration-drift.ts` holds the registry of the enumerations already
bound to their source, and a new exhaustive claim adds a row to it rather than a promise in prose.

**A list that wants binding is written as a table keyed by the member.** The checker's readers are
declared on its `DocumentClaim` type: `code-spans` takes every CONSTANT-shaped backticked name in
the section, `table-rows` takes the first cell of every row, `table-pairs` takes two NAMED columns
and answers `key = value` per row, and `partitioned-tables` takes every table in the section whose
first column carries a named heading. A list written as a comma-separated prose bullet of camelCase
names satisfies none of them, so it cannot be bound however exhaustive it claims to be — which is how `reference/testing/mock-data.md` carried a bullet naming
`webReviewer` against a source key of `reviewer`, and how the same document's `SKILLS` list stood at
ten of eleven with `authSecurity` missing. The decision is available while writing rather than at
the next audit: if the list is worth introducing with "every", "all N" or "no other", give it a
table keyed by the member so a row can bind it; if it is not worth a table, do not introduce it as
exhaustive. Both outcomes are honest and only one of them rots.

**A table stating what each member HOLDS is bound with `table-pairs`, not `table-rows`.** A key-only
binding covers the half that cannot break. `E2E_SKILL_TITLES` in
`reference/testing/e2e-infrastructure.md` was registered, answered `agrees` over ten members and
reported the run clean while five of its Display-title cells were wrong — the slugs were right, and
the titles are what the E2E suite matches on. Name the two columns in the row; the checker refuses a
heading it cannot find (`NO_COLUMN`) rather than reading an empty column, so renaming a heading
reddens the run instead of quietly unbinding the table.

**A row binds a document section to one symbol, so a second symbol enumerating the same members
earns its own row whenever the type system does not hold the two equal.** `WIZARD_STEP_ORDER` in
`src/cli/stores/wizard-store.ts` is `as const satisfies readonly WizardStep[]`, which constrains
what the array may hold and not that it holds everything — a step added to the `WizardStep` union
and to the document's table but never to the constant compiles, paints no tab, and passes the row
bound to the union. That is why it carries a second row against a section that already had one.
`WIZARD_STEP_LABELS` in `src/cli/components/wizard/wizard-tabs.tsx` is the third list of the same
six and must NOT get a row: `as const satisfies Record<WizardStep, string>` is total over the union,
so `tsc` already refuses a step with no label, and a row repeating a check the compiler makes is
noise in a registry read as the list of things nothing else guards.

**A generalisation over a set is a cardinality claim.** "All three checkers", "every one of these",
"each of the four" — the sentence has an N in it, so it is checkable, and an unchecked one is a
count in disguise governed by this same rule. Verify it against every member, not against the
instance in front of you: `scripts/check-shared-tsconfig.ts` declares a three-armed
`WorkspaceVerdict` in which a missing config is `diverged`, while its Vitest and ESLint siblings
carry a fourth outcome that exempts one — so a sentence written from either sibling asserts an
escape route the third forecloses, which is worse than the silence it replaced. Reading three
discriminated unions costs less than writing the sentence that generalises over them.

```
grep -rPn 'all (three|four|five|six|seven|eight) |every one of (them|these)' .ai-docs/reference/
```

---

## An Absence Names No Symbol

The complement of the section above. That one governs a claim that names things, and a checker can
bind it because both sides are lists of names. This one governs a claim that names nothing: "`edit
--from` declares no home-scope location refusal" contains no symbol, so nothing about it can be
falsified from source, and it reads as true forever after it stops being true.

It did stop. `refuseProjectScopedContentAtHome` moved onto `BaseCommand` so both `--from` producers
share it, and `edit.tsx` gained no import — it inherits a `protected` method. A grep for the symbol
returns the same hits before the move and after. Nothing moved, so nothing could detect it, and five
documents described the vanished gap for a day. The worst of them called the absence "a gap rather
than a rule", which reads to the next agent as an instruction to build what already works.

### A call-site census is an absence that names its symbol

"Never called", "never consumed", "architecturally orphaned", "the only two write sites", a bare
count in a heading — each asserts something about the whole codebase, so re-reading the function it
sits under cannot falsify it, and it survives every pass scoped to that function. In one respect it
differs from the absences above, and that respect decides the rule: it **names** the symbol whose
callers are being counted, so it is checkable in one command. Write that command beside the claim:

```
grep -rn 'propagateGlobalChangesToProjects(' src --include='*.ts' --exclude='*.test.ts'
```

One declaration and three production sites answer it; a sentence naming two of them reads
identically and invites a reader to delete an array that is consumed, or to build observability that
already exists on one path. Prefer the shape that breaks visibly — a per-caller table gains a
missing row when a caller lands, where prose just goes quietly wrong. A prose return type is the
same class: never write "returns `void`" without naming the type, because a widened return is
invisible to a prose reader and to every reviewer of the widening. Any sweep touching a document
re-runs the greps its claims carry, whatever the cadence says.

### The census instrument itself can return a lying zero

The rule above is only as good as the command written beside the claim, and on this machine `grep`
is **ugrep**, shimmed in by a shell function so that nothing at the call site says so. Re-derive
which one you are holding before trusting any zero:

```
grep --version | head -1
```

**Run that check — and the reproduction below — as direct commands, never from inside a script.**
The shim is a shell function in the agent's own session, and a function does not cross into a child
interpreter: `bash -c 'grep --version'` answers GNU grep here, so the whole block below returns four
clean matches and the hazard reads as fictional. Nothing in this package is exposed either, because
no script, gate or spec shells out to `grep` at all — the exposure is one agent typing a census at
its own prompt, which is the only place a census is ever typed.

ugrep disagrees with GNU grep on patterns both accept, and it fails in two shapes that have to be
told apart, because only one of them is visible:

| Shape                                                                                      | What the caller sees                                | Remedy                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Loud** — a construct ugrep's parser rejects, such as an unescaped `{` under `-E` or `-P` | empty stdout, exit **2**, an error on stderr        | `-F`, or escape it. `-P` does **not** rescue this one — it errors identically |
| **Silent** — a valid ERE that GNU grep matches and ugrep does not                          | `0` on stdout, exit **1**, **zero bytes on stderr** | `-P` for a pattern census, `-F` for a literal one                             |

**The loud shape becomes the silent one the moment it is piped**, which is how a census usually ends.
`grep … | wc -l` prints `0` for a pattern that never compiled, because the error went to stderr and
`wc` counted an empty stdout. So the remedy is not "watch for an error" — it is to write the census
in a dialect that does not have the failure.

**Do not write down what causes the silent shape.** Three causes have been stated in this repository
with confidence and all three are false, the most recent of them carried into every brief written on
2026-08-22. Each is refuted by one command, measured 2026-08-22 against ugrep 7.8.4:

```
printf 'see [label](http://x/y) here\n' > /tmp/ug.txt
grep -cE '\[.*\]\([^)]*\)'    /tmp/ug.txt ; echo "exit=$?"   # 1, exit 0 -- refutes ") inside a negated class"
grep -cE '\[[^]]*\]'          /tmp/ug.txt ; echo "exit=$?"   # 1, exit 0 -- refutes "[^]] is the trigger"
grep -cE '\[[^]]*\]\([^)]*\)' /tmp/ug.txt ; echo "exit=$?"   # 0, exit 1 -- the hazard, in silence
grep -cP '\[[^]]*\]\([^)]*\)' /tmp/ug.txt ; echo "exit=$?"   # 1, exit 0 -- the remedy
```

GNU grep 3.7 answers `1` at exit 0 to all four. The second line is the one that matters most: it
holds the exact bracket expression the third line is blamed on and matches perfectly, so no property
of that expression can be the trigger. And the hazard needs no bracket character inside any class at
all — on a file holding `see AlabelB(http://x/y) here`, `grep -cE 'A[^B]*B\(.*\)'` is `0` at exit 1
where GNU grep is `1`. That is why the third cause is retired rather than replaced by a fourth.

Every stated cause was true of the specimen in front of its author and false of the class, and the
cost is not a wrong footnote: an author told to avoid `)` inside a negated class writes `[^]]`
instead and lands in the failure. **Write the remedy and not the cause** — a cause invites a reader
to judge their own pattern exempt, and three authors have now judged wrongly. The remedy has never
moved: **a census is `-P` or `-F`, always, whatever the pattern looks like.**

### Filling a gap includes grepping the docs for the gap's own vocabulary

You cannot grep for what you added — the whole failure is that it added no name. Grep for the
language of absence instead:

```
grep -rPn 'declares no|no equivalent|is absent|is a gap|does not exist|untested|no spec|vestigial' .ai-docs/
```

Add the symbol the documents said was missing, and read every hit. **This is a step in filling the
gap, not a tidy-up afterwards** — the change is not finished while a document still tells the next
reader that the thing you just built is not there. Filing a finding does not discharge it: one was
filed, and the five documents stayed wrong.

### Write an absence so it dates itself

Prefer the form that names the check which would prove it. A reader can then re-derive the claim;
otherwise they can only trust it.

```
GOOD: no spec exercises it — `init-from-home-scope.e2e.test.ts` is the only one that reaches it
BAD:  it declares no such refusal
```

The bad form is a claim about the past written in the present tense. Where the absence is structural
rather than incidental, say what would have to change for it to stop being true; an absence with a
stated cause is falsifiable by reading the cause.

### Which claims are unguarded

`scripts/check-enumeration-drift.ts` binds a document's list of names to a symbol's real membership,
and an absence sits outside it by construction. So do the shapes that DO name things but that no
reader can enumerate: a type alias to an object TYPE literal, a call expression (`new Set([...])`,
`z.enum([...])`), an array of OBJECT literals, a `static` class member (`declarationOf` walks
top-level statements only), and a listing of FILES rather than of exported names.
`reference/testing/infrastructure.md` § `check-enumeration-drift.ts` carries that list with each
one's reason. What matters when writing is knowing which side of the line a claim falls on — an
unguarded claim needs the care a guarded one does not, and an absence is never guarded.

**Do not decline to state something on the strength of a limit the checker no longer has.** Four
shapes that this section named as unbindable are now bound: `unwrap` reads through `satisfies`;
`partitioned-tables` binds a list split across several tables; `SourceEnumeration` has a directory
form, so the command roster and a directory's export surface are both expressible; and `table-pairs`
binds a table's VALUE column, so a key-to-value map is no longer half-checked. Read the type
declarations in the script before writing that a claim cannot be bound.

---

## Format Rules

**Tables over prose** — agents extract structured data more reliably from tables.

**Absolute paths from the project root** — `src/cli/lib/compiler.ts`, never "the compiler file" and
never `./lib/compiler.ts`.

**Code blocks over descriptions** — show the actual pattern, not an explanation of it.

**Consistent terminology** — one term per concept, across all docs.

### State the Direction Convention Above Any Transition Table

A table whose rows encode a direction — `G→P`, `P→G`, `before→after`, `on/off`, `add/drop` — states
in prose **immediately above it** what the notation means. Direction is the one column a reviewer
pattern-matches rather than reads, so an inverted row is invisible without the stated convention and
survives every pass that checks the row's other cells. `wizard/state-transitions.md`'s Tombstone
Lifecycle table is the worked example: it used `G -> P` for global→project in one row and for the
reverse in two others, inverting the tombstone lifecycle for anyone who read only that table, while
`store-map.md` described the same action correctly — two documents in one repository stating
opposite things about one store action, with nothing on either page making the disagreement visible.

Where two documents describe the same transition they use **one** notation. Different arrows for one
mechanism is the condition under which neither page can be checked against the other.

The worklist is every document holding a directional row; read each one's convention statement, and
where a table has none, write it from the source rather than from the table:

```
grep -rlP '^\|.*[A-Za-z](→|->)[A-Za-z]' .ai-docs/reference/ .ai-docs/standards/ --include='*.md'
```

### File-Path Conventions

Three accepted forms. Pick ONE for a given document's prose and stay with it.

| Form                  | When to use                                                          | Example                                   |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| Full canonical        | Prose in standards and reference docs                                | `src/cli/lib/matrix/matrix-provider.ts`   |
| Bare (root-relative)  | Inside tree diagrams / file tables under a stated root (`src/cli/`)  | `matrix/matrix-provider.ts`, `consts.ts`  |
| Frontmatter-full-path | **Required** in agent-findings `affected_files:` / `standards_docs:` | `- src/cli/lib/matrix/matrix-provider.ts` |

A single document's prose must not mix `src/cli/utils/x.ts` and `utils/x.ts` for the same file.
Tree diagrams and tables may use the bare form because their root is stated in the preceding
heading or column. Reference tables may legitimately pair bare + canonical in two columns.

`reference/monorepo-layout.md` is the one deliberate exception: its subject is the repository
around `packages/cli`, so its paths are repository-root-relative. Do not "normalise" them.

### Quoted Code From Another Workspace Is Protected From Prettier

`packages/cli` formats with semicolons and every other workspace uses the root config, which does
not. A block quoting `apps/editor` source verbatim inside a file under `packages/cli/.ai-docs/`
therefore has the wrong formatter walking up to it, and prettier rewrites the quotation until it no
longer matches the file it cites — a quoted defect absent from the named file is evidence of
nothing. Protect the fence:

````
<!-- apps/editor source, quoted verbatim — the root config formats it without semicolons. -->
<!-- prettier-ignore -->
```ts
useUiStore.getState().clearFlash()
```
````

The directive is matched literally: `<!-- prettier-ignore -->` on its own line, immediately above
the fence, with no blank line between. One carrying a trailing explanation
(`<!-- prettier-ignore -- because … -->`) is not recognised and silently does nothing, so the
explanation goes in its own comment above it. `npx prettier --check .` is the check, and it runs in
`prepublishOnly` — an unprotected quotation blocks a release with a message that reads cosmetic.

The general form outlives this particular pair of configs: **quoted evidence is data, not source,
and a formatter that owns the file does not own the quotation.** It applies equally to quoted YAML,
JSON or captured output, where normalising is exactly what destroys the claim that the input was
abnormal.

### No Source Line Numbers — Cite by Symbol

**Cite a path and a SYMBOL, never a line number.** Write ``  `classifyLocalSkill` in
`skills/skill-metadata.ts` ``, not `` `skill-metadata.ts:240` ``. A symbol name survives every edit
above it and is greppable; a line number rots on the next unrelated insertion, silently, while
still reading as authoritative.

Line ranges in an inventory TABLE whose whole purpose is to locate a declaration are the one
tolerated exception, and they carry the same rot — prefer the symbol column.

`grep -rPc '\.tsx?:[0-9]+' .ai-docs/reference/` returning zero is the check.

**The ban covers `todo/plans/` on the same terms.** A plan is read under the same trust as a
reference doc — an agent opens it and navigates to its citations — and a plan rots in its
coordinates while every fact in it survives. The dangerous grade is not the dangling citation, which
fails loudly: a line number that has drifted onto a live declaration resolves to a real fact that is
not the one the plan meant, with no signal that anything moved. Run the check over both trees from
the repository root, excluding vendored third-party material:

```
grep -rPl '\.tsx?:[0-9]+' packages/cli/.ai-docs/reference/ todo/plans/ --exclude-dir=contestants
```

A plan proposing a guard names the **value** the guard reads, not the rule in prose. A plan that
cannot name its own discriminator has not been checked, and the cost lands on whoever implements it.

**A `(213 lines)` annotation is the same defect wearing different clothes.** It dates the document
without saying so, it is wrong after the next edit anywhere in the file, and it carries nothing the
symbol name and the path do not.

```
grep -rPn '\([0-9]+ lines?\)' .ai-docs/reference/ .ai-docs/standards/
```

---

## Validation

**Steps:**

1. Read every claim in the document — file paths, symbol names, signatures, counts.
2. Verify each against source with Read/Grep/Glob.
3. Fix errors, add omissions.
4. If and only if you re-derived the whole document, move its `last_validated`.

**What to verify:**

| Claim type            | How to verify                                       |
| --------------------- | --------------------------------------------------- |
| File path             | Read the file — does it exist?                      |
| Symbol name           | Grep the file — is it still declared there?         |
| Function signature    | Read the source — does the signature match exactly? |
| Count                 | Grep/count the actual entries                       |
| Type definition       | Read the type file — do the fields match?           |
| Data flow description | Trace the actual code path                          |

### Re-Validation Triggers Beyond Cadence

Re-validate a document in the current session, ignoring its threshold, when:

- An `agent-findings/*.md` entry lists it in `affected_files:` / `standards_docs:` / `related:`, or
  names a function it documents.
- A change lands in a file it references.
- It covers a class of behaviour (tombstones, guards, state transitions) and a finding in the same
  session touches that class.
- **A source file is deleted, or a release reaps dead code.** Every trigger above is additive, and a
  deletion fires none of them — it is also invisible in a feature changelog while being the highest
  impact event there is for a document made of names. Grep `.ai-docs/` for the removed basename
  before the deletion lands, and retire every hit in the same change. `src/cli/lib/seed/seed-schema.ts`
  went when the contract moved to `@workspace/matrix`; `seed-schema.test.ts` stayed, so the basename
  still greps, and a document naming the deleted module as the source of truth read as current — and
  as an instruction, since agents are told to follow it.

Reference docs age faster than code.

### Changing a Rule Sweeps the Document's Own Copy-Paste Sites

**When a standards document changes a rule, the sweep is not the rule's section plus its
cross-references. It is every place the document hands the reader something to copy** — templates,
worked examples, checklists, boilerplate blocks. Those are the sites with the highest duty cycle and
the lowest scrutiny: the definition is read once, the template is pasted into every job.

**Read them; do not grep them.** A template restates a rule in the shape of an instruction, not in
the shape of the sentence that stated it, so a phrase-grep over the retired wording returns zero
while the mandate is still being issued. `prompt-bible.md`'s Technique #6 retired the expansion
modifiers and the rewriting pass aligned ten cross-reference sites inside that technique's own
neighbourhood — the metrics table, two model-comparison tables, two checklist items, a worked
example, a troubleshooting entry, the conclusion. It did not reach § 8.5, the delegation template
six sections away, whose `<task>` slot went on handing out **"Include all relevant edge cases; go
beyond the minimum"** — a phrase sharing no words with the wording the sweep had grepped for. The
document stated the rule in one place and issued its violation in another, from the half with the
higher duty cycle.

The copy-paste sites of `standards/` are enumerable, and this is the list to open:

```
grep -rnP '^#+ .*(Template|Checklist|Worked Example|Example)' .ai-docs/standards/*.md
```

### Heading Diff: Detecting Sections That Were Never Written

**A validation sweep MUST diff a document's heading list against the exported surface of the
modules it owns.** The claim-by-claim loop only checks claims that exist, so it is structurally
incapable of finding a missing section — and when an owned area gains a **new** subsystem rather
than a changed one, the absent heading is the only drift signal.

Per document, per sweep:

1. Determine the modules the doc owns (read the hook table below in reverse: doc -> source dirs).
2. `Glob` those dirs and list every exported symbol (`export const|function|type|class`).
3. Extract the doc's heading list (`grep '^#'`).
4. Diff. A cluster of exports with no owning heading is a missing section, not a stale line.
5. New section names come from the source, not from what the doc already discusses.

### A Name in a Document Is a Claim About Source

Heading Diff finds the section that was never written. This finds the names inside the sections that
were. A rename or a deletion leaves every heading, every path and every count intact, so nothing
above it fires — and a symbol that reads as authoritative and resolves to nothing costs the reader
the exact grep the document existed to save. Four checks, each runnable.

**1. Grep `.ai-docs/` for the OLD name before the rename or the deletion is finished.** Not after,
and not only in the documents that enumerate the symbol: a registry row binds a list, and nothing
binds a sentence.

```
grep -rn 'globallyInstalledKept' src .ai-docs --exclude-dir=agent-findings
```

Exclude by directory, never by piping through `grep -v agent-findings` — a live hit whose line
happens to cite a findings path is dropped by the filter and the sweep reports clean.

**A citation of a FINDING is checked by a script, and `.ai-docs/` is deliberately not one of its
scopes.** `scripts/check-finding-citations.ts` resolves every finding named by basename from
`todo/`, from `changelogs/` (bracketed links only, so a release note keeps its words) and from
`e2e/`. Its docblock carries the ruling on why `.ai-docs/` is not a fourth scope and why `src/` and
`scripts/` are not either. The short version is that `agent-findings/INDEX.md` names deleted
findings ON PURPOSE — a row naming a file not on disk is the only surviving record that the finding
existed — so a scan over that tree reports the corpus's own archive as its defect and has no route
to zero. The judgement is recorded rather than open: do not add the scope.

**Where the old name survives one layer away, the grep returns live and dead hits mixed and no
reading of the list separates them.** `SkillConfig.origin` was `SkillConfig.source`, and `source` is
still a real field on `SkillReference` and on `Skill`. Judge each hit against the declaration its
sentence means, not against the name:

```
grep -nP '^\s+(source|origin)\??: ' src/cli/types/config.ts src/cli/types/skills.ts
```

Where both twins appear on one page, name the surviving one in the sentence so the next grep is not
ambiguous. And a rename that inverts a meaning is not a rename in the documents:
`globallyInstalledKept` became `globallyInstalledRemoved`, so a page left on the old name described
the opposite behaviour under a symbol nobody could look up. Rewrite those paragraphs rather than
substituting the string.

**2. Every backticked identifier in prose resolves to source.** A path that does not exist fails
loudly the first time it is opened; a name that does not exist fails silently forever. Per name,
zero hits is a hard error — the same severity as a documented path that is not on disk:

```
grep -rnw 'rowStatusMarker' src e2e scripts
```

Over a whole document, extract the camelCase spans and test them together:

```
grep -rhoP '`[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*`' <doc> | tr -d '`' | sort -u |
  while read -r s; do grep -rqw "$s" src e2e scripts || echo "$s"; done
```

The output is a worklist, not a verdict. Two benign classes sit in it: a symbol owned by another
workspace or a dependency (`globalIgnores`, `sumBy`, `seedSkillSchema`), and a name a document
deliberately states does NOT exist — `store-map.md`'s "`enabledSources` / `setEnabledSources` do not
exist — do not look for them" is a live instruction, not drift. Everything else is drift. Two shapes
inside it are easy to miss: a "Store access:" line is a **subscription** claim, verified against the
component's selectors rather than against the store's field list, and a singular "Helper:" line
reads as exhaustive whether or not it says so.

**Check 2 is a PASS-level gate, run last — it is not satisfied by checking each name as you write
it.** The per-name form reads naturally as check-as-you-go and is worth doing, but it can only ever
prove the symbol existed at the moment it was typed. Run the extraction over every document the pass
edited as the LAST step before reporting, after the final gate run. A documentation pass read
`src/cli/hooks/init.ts` in full, confirmed `extractSourceFlag` was declared there and wrote a
corrected paragraph naming it; roughly ten minutes later, in the same session, a concurrent code
sweep reduced the hook to the bare-`cc` dashboard and the symbol was gone. It resolves to nothing
today, deliberately — it is named here as the specimen, and belongs to the benign class above
alongside `enabledSources`. Nothing about the
verification was careless — it was correct when it was performed and false when it was committed, and
only the end-of-pass re-run can see the difference. Where a doc agent and a code agent work one
session, this is systematic rather than incidental: two writers with no shared clock, and the doc
agent's inputs are the code agent's outputs.

**And a name that has vanished makes the enclosing SECTION suspect, not just the sentence.** This is
the worse half and it is silent. The dangling symbol fails loudly the first time a reader greps it;
the paragraph around it went stale at the same moment, with no path, no count and no other symbol
changing — so path verification and identifier resolution both pass over a section describing
machinery that was deleted. Re-read the module before repairing the prose. Where the replacement is
uncommitted, say the section is stale and name the re-derivation rather than describing a refactor
still in flight: `boundary-map.md` § 1.2 is the worked example of that admission, opening with a
warning that names what replaced the machinery and the grep that re-derives it. A confidently wrong
description of new machinery is worse than an admitted gap.

**3. A symbol paired with a file is declared in that file.** Path verification and identifier
resolution both pass on a symbol that MOVED, because the file exists and the name exists — just not
together. That is the worse failure: a reader opens `installation/local-installer.ts` for the
cross-scope masking helpers, finds an unrelated module, and concludes the machinery was deleted
rather than relocated.

```
grep -rnP '^(export )?(async )?(function|const) maskCollidingGlobalSkills' src/cli/lib/config-gate/propagate.ts
```

Where a barrel exports near-synonyms, say which one and why. `loadAllAgents` for `loadMergedAgents`
compiles, and silently drops project-local agent overrides.

**4. An exhaustive table is diffed by ROW, in both directions.** A row-first pass cannot see a
missing row and a source-first pass cannot see a phantom one, so one direction is not a validation.
The preferred form is a registry row in `scripts/check-enumeration-drift.ts`, which reports
`namedButAbsent` and `presentButUnnamed` separately for exactly this reason. Where the shape is not
registrable, the diff is two extractions and a `comm`:

```
comm -3 \
  <(sed -n '/^### Message builder functions/,/^## /p' .ai-docs/reference/utilities.md \
      | grep -oP '^\| `[a-zA-Z0-9_]+' | grep -oP '[a-zA-Z0-9_]+$' | sort -u) \
  <(grep -oP '^export function [a-zA-Z0-9_]+' src/cli/utils/messages.ts | awk '{print $3}' | sort -u)
```

Empty output is agreement; column one is named-but-absent, column two present-but-unnamed. A total
is no substitute: two lists can agree on a total and share no names, and a builder table out by one
has been out by three names at once — one present that should not have been, two absent that should
have been — so a count-only check flags it by one and points at nothing in particular. The same
applies where the atomic unit is an edge rather than a row: derive the whole relation from source
and diff it both ways, which is the only thing that finds an import a graph never recorded.

### Where this stops: in a source comment, `{@link}` is the citation and a backtick is prose

The four checks above govern a **document**. A source comment is deliberately not held to check 2,
and the split is the rule: **`{@link X}` asks an editor to resolve `X`; a backtick asks for
nothing.**

Check 2 cannot be run over source here, and not for want of a better scanner. The house style in
this codebase is to explain what was REMOVED — _"it used to have a `DOMAIN` beside it"_, _"this
class declares no `baseFlags`"_ — so by construction its best comments name symbols nothing
declares. A scan over backticked names in comments is permanently red on correct prose, and a
permanently red check gets answered by deleting the sentence rather than by repairing a citation.
That is the benign class under check 2, one layer down and far more common.

So write `{@link}` where a reader should be able to jump to a declaration, and a backtick where the
sentence is prose about a name — including a name that is deliberately gone. Three forms read as
citations and resolve to nothing:

| Written                                                                                   | Why it does not resolve                                                                           | Write instead                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `{@link member}` — an interface or type-literal member, cited from outside that member    | Namepath resolution is lexical; a type's members are not in scope                                 | `{@link Type.member}`              |
| `{@link import("./mod.js").thing}`                                                        | `{@link}` takes an entity name, and `import(...)` is not one — the parser stops at `import`       | Import the name, or use a backtick |
| `{@link ./mod.ts}` — a bare module path where an entity name goes                         | The same reason one step further: this parses to no name at all, so there is nothing to ask about | Backtick the filename              |
| `{@link exportedElsewhere}` — a name another module declares and this one does not import | Resolution is lexical here too, so a name that greps beautifully still lands nowhere from here    | Backtick it and name its module    |

**Backticking a citation does not turn it into prose, and that is the one worth reading twice.** The
JSDoc parser does not read backticks, so `` `{@link nowhere}` `` is judged exactly as `{@link nowhere}`
is. The rule above says to write a backticked NAME instead of a citation — not to wrap the citation
in backticks, which changes nothing about what the compiler is asked to resolve. The obvious
consequence is that a document explaining the rule cannot spell an example out in source:
`scripts/check-symbol-citations.test.ts` assembles its fixture citations at runtime for that reason.

A CLASS member is the case that goes the other way: cited bare from a sibling member's comment it
resolves for `tsc`, so it is correct as written. `BaseCommand`'s `incompleteWork` docblock, citing
`exitIfWorkIncomplete` and `hasIncompleteWork`, is the live example. Read the instrument note below
before treating that as settled.

Enumerate the citations with a FIXED-string grep. An unescaped `{` is a repetition operator, and
ugrep rejects this one outright rather than matching nothing — exit 2 with the reason on stderr,
which the `| wc -l` below then reports to the caller as `0`. `-F` is what fixes it and `-P` is not;
see [The census instrument itself can return a lying zero](#the-census-instrument-itself-can-return-a-lying-zero),
which governs every census in this document and distinguishes this loud failure from the silent one:

```
grep -rIoh -F '{@link' src e2e scripts --include='*.ts' --include='*.tsx' | wc -l
```

**This is gated now, by `scripts/check-symbol-citations.ts`** (2026-08-22, owner ruling on
). Neither `tsc` nor ESLint holds it: verified 2026-08-21 by injecting one unresolvable
`{@link}` into an e2e spec, over which `bun run typecheck` and `bun run lint` both passed in silence.
The check walks every `JSDocLink` node and asks `checker.getSymbolAtLocation`, once per tsconfig
project, and its suite is how it runs — `reference/testing/infrastructure.md` carries its roster
binding and its three stated limits.

**Why the compiler and not `eslint-plugin-jsdoc`.** `jsdoc/no-undefined-types` reads ESLint's scope
rather than the type graph, so it reports the sibling-member form above — which `tsc` resolves and
which is correct as written — and misses every `import(...)` namepath. TypeDoc's
`--validation.invalidLink` resolves against the real program and catches both, and adds a warning for
every citation to a symbol that resolves but is not exported. The finding
`2026-08-21-the-link-citation-is-followed-almost-everywhere-and-checked-nowhere` carries the
per-instrument comparison and the site list that preceded the gate.

**Two notes on building the walk, both paid for once.** `ts.forEachChild` descends into none of a
node's `jsDoc`, `comment` or `tags`, so a walk built on it reads every statement in the package,
finds no citation at all and reports a clean tree; `node.getChildren(sourceFile)` reaches them.
And prefer `ts.getParsedCommandLineOfConfigFile` for the config — not because
`ts.parseJsonConfigFileContent` ignores `extends`, which was asserted here until 2026-08-22 and is
false (measured against TypeScript 6.0.3: both resolve the two-level chain and both yield 414 root
files for this package's `tsconfig.json`), but because it is the entry point that takes a diagnostics
reporter, so a config TypeScript cannot read fails by name instead of yielding a `ParsedCommandLine`
full of errors a caller has to remember to inspect.

### Doc-Touching Changes (Feature / Rename / Deletion Hooks)

When shipping a change that touches these files, grep the listed docs and update them in the same
session. **Every source directory under `src/cli/` must appear here** — a directory with no row
produces no hook, and a change there ships undocumented no matter how diligent the agent is.

Two limits of the table, both load-bearing. It routes by **directory**, so a rename or a deletion
_inside_ an already-hooked directory changes no row and fires nothing; that class is caught by
[A Name in a Document Is a Claim About Source](#a-name-in-a-document-is-a-claim-about-source), not
here. And a file whose owning docs differ from its directory's gets its **own** row above the
directory's, because an agent scanning for its own change stops at the first match.

| Change                                                                                                                                                           | Doc(s) to grep + update                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A change that RESTORES a previously-removed mechanism**, whatever directory it lands in                                                                        | The directory's own row below, **plus** every document asserting the removal — found with the absence vocabulary in [Filling a gap includes grepping the docs for the gap's own vocabulary](#filling-a-gap-includes-grepping-the-docs-for-the-gaps-own-vocabulary), not by grepping the symbol you just re-added |
| Command or its public signature added / deleted / renamed (`src/cli/commands/**`) — includes `static flags`, `static baseFlags`, `static args`, `static aliases` | `commands/index.md`, `dependency-graph.md`, `boundary-map.md`                                                                                                                                                                                                                                                    |
| Component added / deleted / renamed (`src/cli/components/**`, `src/cli/hooks/**`)                                                                                | `component-patterns.md`, `dependency-graph.md`                                                                                                                                                                                                                                                                   |
| New trust-boundary op (read/write/exec), or a change to an existing one                                                                                          | `boundary-map.md`                                                                                                                                                                                                                                                                                                |
| Change to `config-types-writer.ts`                                                                                                                               | `boundary-map.md`, `dependency-graph.md`                                                                                                                                                                                                                                                                         |
| Any change under `src/cli/stores/**`, or a store refactor (prop-driven <-> hydration-before-render)                                                              | `store-map.md`, `wizard/state-transitions.md`, `features/wizard-flow.md`                                                                                                                                                                                                                                         |
| Mock-data constants added / removed                                                                                                                              | `testing/mock-data.md`                                                                                                                                                                                                                                                                                           |
| Any change under `src/cli/lib/installation/**`                                                                                                                   | `features/plugin-system.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`, `config/config-writer.md`                                                                                                                                                                                              |
| Any change under `src/cli/lib/plugins/**` or to `permission-checker.tsx`                                                                                         | `features/plugin-system.md`, `boundary-map.md`                                                                                                                                                                                                                                                                   |
| Matrix composition inputs (`default-categories.ts`, `default-rules.ts`, `lib/matrix/**`, `lib/loading/**`, regenerated `types/generated/**`)                     | `features/skills-and-matrix.md` (esp. Known Limitations + Current Counts), `type-system.md`, `types/core-types.md`                                                                                                                                                                                               |
| Any change to `src/cli/lib/configuration/default-stacks.ts` — a stack, an assignment, a preload flag                                                             | `features/built-in-catalogue.md` (owns its structural invariants and their counts)                                                                                                                                                                                                                               |
| Any change under `src/cli/lib/configuration/**`                                                                                                                  | `features/configuration.md`, `config/config-writer.md`, `config/config-merger.md`, `config/scope-split.md`                                                                                                                                                                                                       |
| Any change under `src/cli/lib/operations/**`                                                                                                                     | `features/operations-layer.md`, `types/operations-types.md`, `dependency-graph.md`                                                                                                                                                                                                                               |
| Any change under `src/cli/lib/agents/**`, or to `lib/compiler.ts`                                                                                                | `features/agent-system.md`, `features/compilation-pipeline.md`                                                                                                                                                                                                                                                   |
| Any change under `src/cli/lib/skills/**` or `src/cli/lib/stacks/**`                                                                                              | `features/skills-and-matrix.md`, `features/compilation-pipeline.md`, `skills/skill-primitives.md`                                                                                                                                                                                                                |
| Any change under `src/cli/lib/wizard/**`                                                                                                                         | `features/wizard-flow.md`, `wizard/state-transitions.md`, `concepts/guard-pattern.md`                                                                                                                                                                                                                            |
| Any change under `src/cli/lib/seed/**`                                                                                                                           | `features/seed-contract.md`                                                                                                                                                                                                                                                                                      |
| Any change under `src/cli/lib/config-gate/**`                                                                                                                    | `boundary-map.md`, `config/config-writer.md`                                                                                                                                                                                                                                                                     |
| Any change to `lib/schemas.ts` or `lib/schema-validator.ts`                                                                                                      | `types/zod-schemas.md` (owns the schema count), `boundary-map.md`                                                                                                                                                                                                                                                |
| Any change under `src/cli/utils/**`, or to `consts.ts` / `lib/exit-codes.ts`                                                                                     | `utilities.md`                                                                                                                                                                                                                                                                                                   |
| Any change under `src/cli/types/**` — **a comment-only edit counts**, and also owes `bun run generate:matrix` (see below)                                        | `type-system.md`, `types/core-types.md`, `types/operations-types.md`                                                                                                                                                                                                                                             |
| Test-infrastructure change (`__tests__/factories/`, `__tests__/helpers/`, `e2e/pages/`, `e2e/helpers/`)                                                          | `testing/factories.md`, `testing/e2e-infrastructure.md`, `standards/e2e/*`                                                                                                                                                                                                                                       |
| `scripts/**` generators, `tsup.config.ts`, `package.json` scripts                                                                                                | `features/code-generation.md`, `build-and-packaging.md`, `monorepo-layout.md`                                                                                                                                                                                                                                    |

**Grep the diff, not the release notes.** A release note describes user-visible behaviour; a hook
row describes which document owns the code that produced it. The two do not overlap reliably.

**Why restoration has its own row, above the directory rows.** Every other row keys on adding,
deleting or renaming, and a restoration reads as an addition — so it routes the agent to update the
owning document and stops there. That is the wrong action. The documents that go wrong are the ones
asserting the mechanism is **gone**, and they are not necessarily the owning ones: three documents
recorded `CategoryGrid`'s post-mount focus-seed effect as deleted, a later change re-added it, and
all three sentences became false while a fourth became exactly backwards. A restoration is also the
one change class the deletion hooks cannot cover in reverse, because the sentence it invalidates
names no symbol to grep — which is why the row sends you to the absence vocabulary rather than to
the name you just brought back.

**Why `src/cli/types/**` owes a regeneration, and why the word "comments" is load-bearing.**
`scripts/generate-matrix-package.ts` copies the seven files in `VENDORED_TYPE_FILES` into
`packages/matrix/src/vendor/` **byte for byte**, and byte for byte includes comments. Correcting a
stale JSDoc line in `src/cli/types/skills.ts` — a change with no type, no value and no behaviour in
it — drifts the vendored copies and turns `scripts/generate-matrix-package.test.ts` red. Every agent
already knows a type change propagates; nobody expects a comment to, which is the whole of the
defect. `bun scripts/run-generate-matrix-package.ts --check` compares in memory and answers it
without writing anything.

---

## Content Rules for Specific Document Kinds

### Command reference

1. **Verify `static flags` and `static baseFlags` before documenting flags.** If either is `{}`,
   the command has no flags of that kind.
2. **Glob `src/cli/commands/**/*.{ts,tsx}` and diff against the index table.** Flag any row whose
   file does not exist, and any command file with no row.
3. **Diff every documented flag/arg row against `static flags` / `static baseFlags` /
   `static args`.** A documented flag that no longer parses is a **hard error, not staleness** — an
   agent following the doc emits an invocation oclif rejects.
4. **A removed flag leaves an explicit callout naming the removal and the replacement behaviour**,
   not just a deleted row. This is the one place a superseded value earns its keep: everyone who
   already knows the old flag needs the signal.

### Known Limitations

When a documented system has an open hardening task in `todo/cli.md`, the reference doc MUST carry
a **Known Limitations** section with file and function anchors.

- **Re-check a limitation against the fix, not merely re-date it.** A limitation MUST be
  re-validated whenever a change lands touching the code it names, even while the task stays open.
- State the **mechanism** (unchanged / changed) separately from the **reach** (which paths can
  still hit it). A fix commonly changes only the reach. Where the reach is now guarded by a test,
  name that test.
- **A limitation whose fix shipped is removed in the same session as the fix.** A closed limitation
  left standing reads as an open one and gets designed around.
- The dangerous shape is the half-right limitation — authoritative in tone, wrong in blast radius.
  Where a limitation asserts an observable artifact (an `order: 999` entry, a file that should not
  exist, an absent field), **grep the artifact during validation**.

### Wizard and component docs

- **Hydration vs props:** if state flows through a `hydrateXStore(options)` call before render
  rather than through props, name that function, show the `HydrateOptions` type, and keep the
  `XxxProps` shape minimal.
- **Hook table:** every entry MUST be confirmed to exist via `Glob` before re-validation.
- **Hotkey registry:** enumerate only constants that exist in `hotkeys.ts`, and include an explicit
  "No other `HOTKEY_*` constants exist" sentinel.

### Store map

- Every non-exported helper at module scope MUST appear under Internal Helpers.
- State fields that are (a) set once and never modified, or (b) act as decision probes read by
  multiple actions, MUST enumerate their consumers — not just their authoring action.
- The hydration entry point (the imperative `setState` batch before first render) gets its own
  section, separate from the action table.

### Guard and side-effect inventories

1. **Enumerate every user-visible outcome** the inventoried code produces. Where a guard is split
   between a dispatcher layer (the `wizard.tsx` hotkey handler) and a store action layer, document
   BOTH and state which path wins for which caller class (hotkey vs direct action vs test).
2. Include a **Silent Guards table** annotated with race risk: whether the silence is intentional
   contract-violation defence, intentional shaping, or a race surface needing an E2E wait or
   synchronous seeding.

### Exhaustive enumeration over glob shorthand

Listing constants or exports (mock data, skills registry, hotkeys, Zod schemas) uses **exhaustive
name lists**, never `*_MATRIX - pre-built constants` or `etc.`. Glob descriptions let a phantom
export survive indefinitely, because nothing in the doc claims it should not be there.

### Splits and pointers

When a document is split, the original becomes a pointer **in the same session** — never leave the
pre-split body alongside its children.

A pointer contains: a "where content lives now" table mapping topics to child paths, the reason the
path is kept (inbound links), and no other content.

**Direction is not implied by path depth.** A pointer may be the root file or the subdirectory
file. Two current pairs are root-pointer/subdirectory-canonical (`commands.md` ->
`commands/index.md`, `state-transitions.md` -> `wizard/state-transitions.md`). Determine direction
by **reading both files**: the canonical one holds the body, the pointer holds a redirect table and
nothing else. Getting it backwards excludes a canonical doc from staleness tracking entirely.

---

## Progressive Loading

| Tier    | What to load             | When                                         |
| ------- | ------------------------ | -------------------------------------------- |
| **1st** | `DOCUMENTATION_MAP.md`   | Always first — shows what exists             |
| **2nd** | The area's reference doc | When working on that area                    |
| **3rd** | The subsystem's doc      | When working inside that subsystem           |
| **4th** | `documentation-bible.md` | Only when creating or updating documentation |

### Cross-Reference Instead of Duplicate

| Belongs in `.ai-docs/`     | Belongs in a skill                    |
| -------------------------- | ------------------------------------- |
| File locations and paths   | Coding patterns and conventions       |
| State shape and actions    | Best practices (React, Zustand, etc.) |
| Data flow through codebase | Anti-patterns to avoid                |
| Component relationships    | Testing patterns                      |

---

## Creating New Documentation

**Create when:** a new subsystem is added, an existing one is significantly restructured, or a
validation pass finds an undocumented area.

**Do not create when:** the information is derivable by reading the code, duplicates a skill, is
general knowledge, or is small enough for a line in CLAUDE.md.

**Template:**

```markdown
---
last_validated: YYYY-MM-DD
---

# [Area]

## Overview

**Purpose:** [one sentence]
**Entry point:** `src/cli/[path]`

## File Structure

| File                    | Purpose     |
| ----------------------- | ----------- |
| `src/cli/lib/[file].ts` | Description |

## Data Flow

1. `file.ts` does X
2. `other-file.ts` does Y

## Key Types

| Type       | File            | Purpose     |
| ---------- | --------------- | ----------- |
| `TypeName` | `types/file.ts` | Description |

## Key Functions

| Function       | File          | Signature                     |
| -------------- | ------------- | ----------------------------- |
| `functionName` | `lib/file.ts` | `(param: Type) => ReturnType` |
```

Then add a row to `DOCUMENTATION_MAP.md`.

---

## Quality Standards

Good AI documentation is **specific** (every claim has a path and a symbol), **verifiable**,
**structured** (tables and code blocks), **current** (the date is recent and the cited symbols
still exist), and **minimal** (WHERE things are and WHAT they do).

| Anti-pattern               | Example                                               | Fix                                                                                         |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vague claims               | "The codebase uses Zustand"                           | "Wizard state: `src/cli/stores/wizard-store.ts`, accessed via `useWizardStore()` selectors" |
| Tutorial content           | "Zustand is a lightweight state library..."           | Remove — agents already know what Zustand is                                                |
| Missing paths              | "Exit codes are defined as constants"                 | "`EXIT_CODES` in `src/cli/lib/exit-codes.ts`"                                               |
| Invented examples          | Code not from actual source                           | Quote the actual code, cited by symbol                                                      |
| General knowledge          | "oclif is a framework for building CLIs..."           | Document THIS project's oclif patterns only                                                 |
| Duplicating skills         | Repeating Zustand patterns from a skill               | Cross-reference the skill                                                                   |
| Pass narration             | "Corrected 2026-08-06; previously said Ink v5"        | State the current fact and nothing else                                                     |
| Task IDs                   | "the D-279 masking layer"                             | Name the behaviour: "the cross-scope masking layer"                                         |
| Symbol in a module it left | "`maskCollidingGlobalSkills` in `local-installer.ts`" | Grep the declaration; pair a symbol with the file that declares it                          |
| Line-count annotation      | "`skill-copier.ts` (213 lines)"                       | Name the symbol — a count dates the document silently                                       |

### Self-Correction Triggers

| Trigger                                           | Correction                                 |
| ------------------------------------------------- | ------------------------------------------ |
| Documenting without reading the code              | Read the actual source files.              |
| Generic description instead of a file path        | Give a specific path plus a symbol name.   |
| Citing a source line number                       | Cite the enclosing symbol.                 |
| Writing what this pass checked or corrected       | That is the commit message's job.          |
| Writing a fact as a diff from its previous value  | State the fact.                            |
| Citing a task ID                                  | Name the behaviour.                        |
| Moving `last_validated` after a partial pass      | Leave the date.                            |
| Reporting success without re-reading the file     | Read the file to confirm the write landed. |
| Renaming or deleting a symbol or a module         | Grep `.ai-docs/` for the old name first.   |
| Writing "all three" / "every one of these"        | It is a count. Check every member.         |
| Writing "never called" / "the only N call sites"  | Put the grep that settles it beside it.    |
| Quoting a non-`packages/cli` workspace in a fence | Add `<!-- prettier-ignore -->` above it.   |

---

## Agent Findings

`.ai-docs/agent-findings/` is the deliberate exception to everything above: its entries are dated
point-in-time evidence and say so. They are not maintained, not re-validated and not swept for
staleness.

**Which is not the same as "nothing in one is current", and the split is written out once, in
`agent-findings/README.md` -> "Reading a Finding".** The short of it: the body and the file lists
describe the tree on the entry's own date and stay as written; `status:` and `partial_note:` are
live and are corrected in place. Read that section before opening a tracker row against a finding —
a finding the tree has moved past is history rather than a defect, and correcting its body to match
today's code destroys the record it exists to be.

**A Proposed Standard is evidence that a rule is needed, not the text of one.** The paragraph above
is the reason: a finding is frozen on the day it is written while the code, the library versions and
the conventions it was written against keep moving, so the older a Proposed Standard is, the more
likely the pass adopting it is the first reader since. Re-derive the rule from source before writing
it, and verify first whatever the finding named most specifically — the call, the matcher, the
field, the version — because that is both the part most likely to have moved and the part a reader
will copy. Where the finding's own worked example is still in the tree, prefer the example to the
finding's prose: the spec was updated when the dependency moved and the finding was not. Where
source and the finding disagree, source wins, and the disagreement is reported rather than quietly
reconciled.

Two measured instances, both from one grading pass. A finding proposing `lastFrame()` for an Ink
error-boundary assertion was correct against Ink 5 and produces a failing test against Ink 7, which
is what ships — the live spec `summary-panel.test.tsx` asserts over `frames.join("\n")` and says
why. A finding prescribing a fixture that states `SkillConfig.source` was written before the field
was renamed `origin`, so its rule named a property no type carries and `buildSkillConfig` does not
default. Adopting either verbatim puts a false instruction in a standards document, and the next
author reads the red as a product regression rather than as bad advice — the same shape as the
defect the original finding was about.

This is narrower than `agent-findings/README.md`'s "a Proposed Standard is a proposal, cross-check
it against the NEVER list": that guards a proposal which was always wrong, this guards one that
stopped being right.

Every file there (other than `README.md` and `TEMPLATE.md`) MUST:

1. **Open with a YAML frontmatter block matching `TEMPLATE.md`.** Files without frontmatter are not
   processed by convention-keeper or codex-keeper sweeps.
2. **Use a `root_cause` from the allowed enum** (`missing-rule | rule-not-visible |
rule-not-specific-enough | convention-undocumented | enforcement-gap |
scope-discipline-deferred`). When an authentic root cause does not fit, widen the enum in
   `TEMPLATE.md` rather than inventing an ad-hoc value.
3. **Declare `status:`.** Reading an absent status as `open` mis-classifies resolved work as
   outstanding and invents work that was already done.
4. **Cross-link** via `supersedes:` / `superseded_by:` when a discovery finding is replaced by a
   fix finding over the same files and root cause.
5. **Quote every multi-sentence value, or write it as a `>-` block scalar.** A plain YAML scalar
   cannot contain a bare `: `, and prose is where a colon turns up — so the fields carrying prose
   are exactly the fields that break, which is to say `resolved_by:` and `partial_note:`, the two
   this standard makes conditionally REQUIRED. Ten findings were unparseable this way, and every
   scan in the table below was silently skipping all ten while reporting a count over the rest.
   `TEMPLATE.md` -> schema rule 5 has the authoring guidance.

Seven defect classes a pre-processing pass scans for. **Class `g` runs first**: every other row is
defined over parsed frontmatter, so a scan that reports a count without first proving the directory
parses is a count over the files it could read, which is not the same claim.

| #   | Defect                                                        | Detection                                                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| g   | Frontmatter no YAML parser can read                           | `scripts/check-findings-frontmatter.ts` — parses every file, fails on any it cannot      |
| a   | File without frontmatter                                      | No leading `---` block                                                                   |
| b   | `root_cause:` outside the enum                                | `grep -h '^root_cause:'` vs the enum in `TEMPLATE.md`                                    |
| c   | Two findings over one symbol whose `status:` values disagree  | Compare `affected_files` and body symbols across files, **ignoring date and root cause** |
| d   | `type:` outside the `TEMPLATE.md` enum                        | `grep -h '^type:'`; note `enforcement-gap` is a `root_cause` value, never a `type`       |
| e   | `superseded_by:` / `supersedes:` without `status: superseded` | Cross-check the pair on each file                                                        |
| f   | Missing `status:`                                             | `grep -L '^status:'`                                                                     |

Any rollup quoting a status distribution MUST state how many files had no `status:` and were
inferred.

**Class (c) is a review prompt rather than an error, and its key deliberately drops the date.** A
file legitimately accumulates unrelated findings, so two hits are not automatically a defect — but a
`resolved` finding and an `open` or `partial` one over the same symbol cannot both be true, and one
of them is telling a reader to go and fix what is already fixed. A key including `date` and
`root_cause` can only fire on same-day duplicates, which their own author catches; the pair nobody
catches is months apart and filed under different causes. The instance that produced this rule was
exactly that shape — a project-path normalisation asymmetry reported once as
`convention-undocumented` and again months later as `enforcement-gap`, fixed once, with the older
file left at `status: partial` and a `partial_note` naming two functions that already shared
`normalizeProjectPath`.

**So resolving a finding includes a sibling sweep.** Before writing `status: resolved`, grep the
directory for each of the finding's `affected_files` entries and for the function names in its body.
Resolve any sibling covering the same defect in the same pass, or link the pair — `supersedes:` on
the newer, `superseded_by:` plus `status: superseded` on the older. **A defect is not closed while
another finding still asserts it is open.** And re-read every `partial_note:` you touch: it is a
claim about the code as it stands rather than a historical record, so it is rewritten or deleted
when the code moves, and it carries no source line numbers — the rule everywhere else in `.ai-docs/`
matters more here, because this field is read as current state.

```
grep -l '<an affected_files entry>' .ai-docs/agent-findings/*.md | xargs grep -H '^status:'
```
