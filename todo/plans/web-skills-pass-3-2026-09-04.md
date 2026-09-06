# Web skills — pass 3: the surfaces the first two passes did not reach

Progress file for the programme opened **2026-09-04**, after the owner asked what the two-pass
doctrine programme had actually removed and whether it matched the request. Answering that question
with measurement rather than recall turned up two surfaces neither pass covered, and this file is the
record of closing them.

Its parent is [`web-skills-doctrine-alignment-2026-09-04.md`](./web-skills-doctrine-alignment-2026-09-04.md);
the sub-agent sibling is [`agent-doctrine-alignment-2026-09-04.md`](./agent-doctrine-alignment-2026-09-04.md).

---

## The measurement that opened it

The parent file recorded that pass 1 "left the example files alone" in one lane, and estimated the
unexamined remainder at **~4,000 lines**. That figure was one lane's local measurement generalised to
the tree. Measured properly — every `web-*` markdown file byte-compared against the git baseline
extracted at the commit the programme opened on:

```bash
# from /home/vince/dev/skills, with the baseline at scratchpad/baseline/
while IFS= read -r f; do
  rel=${f#*/baseline/}; cur="src/skills/$rel"
  [ -f "$cur" ] || continue
  cmp -s "$f" "$cur" && echo "UNTOUCHED $cur" || echo "CHANGED $cur"
done < <(find <baseline> -name '*.md')
```

| Surface                                                      | Files                  | Lines      |
| ------------------------------------------------------------ | ---------------------- | ---------- |
| **Byte-identical to baseline — never opened by either pass** | 38 (35 in `examples/`) | **10,190** |
| Changed by the programme                                     | 500                    | 141,116    |
| Deleted by the programme                                     | 10                     | —          |

**The estimate was low by 2.5×.** More importantly, the two surfaces need opposite work, which the
original recommendation had conflated:

- **A file the programme never wrote to cannot contain a programme-introduced defect.** A substitution
  sweep over the untouched set is looking for something that is not there by construction, and the
  baseline is useless as a restoration reference because those files _are_ the baseline.
- **The substitution risk lives entirely in the 500 changed files**, and pass 2's audit of them
  concentrated on `SKILL.md` and `reference.md`. The 340 changed files under `examples/` — 100,789
  lines — were never systematically audited.

## Two further facts, measured before dispatch so no lane re-derives them

- The 38 untouched files carry **zero** `You MUST`, `CRITICAL:` or "Failure to follow". The doctrine
  lens has nothing to do there; what they never received is the concision mandate and a factual check.
- Every untouched example file is still **referenced by name from its `SKILL.md`**, so none is
  orphaned. But the `SKILL.md` was rewritten and the example was not, which makes **cross-layer
  agreement** the highest-value lens on that surface and one nobody has run.

**A correction to the parent file, folded in here.** It reported residual `You MUST` in the web
skills. There are none. The occurrences are in `meta-planning-web-planning` and
`meta-reviewing-web-reviewing` — meta skills swept in by a `-path '*web-*'` glob and never in scope.
The web doctrine sweep is complete: 797 → 0.

---

## The detector

The dominant defect shape pass 2 found in `examples/` was _pass 1 deleted a declaration and kept a
reference into it_ — snippets that no longer compile. That shape is mechanically findable, so it was
scripted rather than read for: **identifiers used in the current file, declared in the baseline, and
declared nowhere in the current file.** Script at `scratchpad/dangling.py`, worklist at
`scratchpad/dangling-candidates.txt`.

**59 files carry candidates.** Precision was measured before dispatch rather than assumed, on the
highest-scoring file:

```bash
f=src/skills/web-error-handling-result-types/examples/combining.md
for id in Order OrderItem RegistrationForm SetupError createUser validateAge; do
  grep -cE "(interface|type|const|function|class) +$id\b" "$f"; done
```

**6 of 6 are real** — every one declared in the baseline, referenced in the current file, declared
nowhere in it. `export function validateOrder(order: Order): Result<Order, OrderError>` has no
`Order` to resolve.

**What the detector cannot see, and why no lane is allowed to work only from it.** It finds one shape
of four. The programme's two worst defects — a data layer invented to take a connection secret as a
per-query argument, and a fabricated spring-physics rule that contradicted the code block above it —
are both **invisible to it, because nothing was lost**. Something wrong was added. Lanes are briefed
to read for the other three shapes and told that the count of candidates they _dismiss_ matters as
much as the count they confirm, because that number is what measures the detector.

---

## Lanes

Seven dispatched 2026-09-04, on disjoint files. No skill appears in both surfaces.

### Surface A — the 38 untouched files (lenses: cross-layer agreement, factual currency, concision)

| Lane | Skills                                                                                                                                   | Files |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| U1   | `angular-standalone`, `routing-react-router`, `ui-base-ui`                                                                               | 14    |
| U2   | `realtime-sse`, `realtime-websockets`, `qwik`, `docusaurus`, `vitepress`, `forms-tanstack-form`, `ui-chakra-ui`                          | 10    |
| U3   | `svelte`, `vue-composition-api`, `i18n-next-intl`, `pinia`, `redux-toolkit`, `styling-design-tokens`, `styling-theming`, `ui-ant-design` | 14    |

### Surface B — substitution audit of changed `examples/` (59 candidate files)

| Lane | Skills                                                                                                                                        | Files |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| S1   | `swr`, `vue-test-utils`, `file-upload-patterns`, `tanstack-router`, `error-boundaries`, `zustand`, `vue-i18n`, `view-transitions`             | 20    |
| S2   | `rxjs`, `storybook`, `mobx`, `date-fns`, `pwa-offline-first`, `graphql-apollo`, `react-query`, `d3`, `web-accessibility`                      | 20    |
| S3   | `nextjs`, `native-js`, `react-testing-library`, `result-types`, `framework-react`, `playwright-e2e`, `cypress-e2e`, `web-performance`, `trpc` | 19    |

### The sub-agent question

| Lane | Subject                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K    | `meta/codex-keeper` — 1,680 → 421 lines and **47 fenced code blocks → 0**, leaving a documentation-writing agent with no worked example of the artefact it produces. Briefed as an open question with three acceptable answers, not as an instruction to restore |

---

## Dispatch log

One line per lane as it lands, carrying its corrections — because a correction read once and
discarded measures nothing, and the rate is a fact about a programme rather than about a dispatch.

| Lane               | Landed     | Confirmed                  | Dismissed                                 | Corrections                                                                                                                          |
| ------------------ | ---------- | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| K — `codex-keeper` | 2026-09-04 | 1 gap, not the one briefed | the worked example, refused with evidence | my brief put the four `## Example …` sections in `playbook.md`; they were in `output.md`                                             |
| S1                 | 2026-09-04 | 14 files                   | 45 of 67 (detector precision 33%)         | the SWR `createClient` invention was already fixed; skill has 8 files not 7; **and the gates I briefed were unrunnable — see below** |

### A briefing error of mine that hit all six skills lanes

**`skill-summoner` has no Bash tool** — Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, Skill and
nothing else. Every one of the six skills briefs ended with a gate block telling the lane to run
`npx prettier --check` and `bun scripts/validate-metadata.mjs`, which none of them can execute. S1
reported it rather than quietly skipping, which is the behaviour the briefing standard is for.

**The orchestrator runs the gates for these lanes.** Done for S1: prettier clean on all changed files,
`validate-metadata` **238/238 pass**. The lane's own mitigation was sound — it changed no
`metadata.yaml` or `SKILL.md`, so the metadata gate could not have been affected by its diff.

### Lane S1 — the mechanical sweep is not sufficient, and now there is a number

**Nine of S1's fourteen fixes came from reading, not from the worklist.** The detector could not see
the invented `captureOwnerStack` rationale, the S3 erasure, two undeclared environment flags, missing
imports in three files, or a lost type. Most tellingly it scored `mutations.md` **clean** on `Post` —
because `Post` _is_ declared in that file, just contradictorily and below first use, which is the more
serious of the two defects.

**Detector precision measured: 22 confirmed of 67 candidates (33%), but every capitalised type
candidate was real — 22 of 22.** The dismissals were object property names, Vue template bindings and
selector strings read as free identifiers, and library hooks. That splits the tool cleanly: it is
reliable for types and components and near-worthless for lowercase locals.

**The densest defect was not the shape the brief predicted.** SWR carried **22 stripped type
declarations across 6 of its 7 example files** — `useSWR<User, FetchError>` with no `User`,
`useState<Status>` with no `Status`, and a `pagination.md` in which not one snippet compiled. Verified
independently: all 9 types now declared exactly once.

**Two defects that were not rewrite regressions**, both correctly flagged as pre-existing rather than
attributed to the programme:

- `web-i18n-vue-i18n/examples/lazy-loading.md` — `detectLocale(undefined, cookieLocale) || browserLang !== undefined ? … : …`
  binds as `(a || b) ? …`, and `detectLocale` always returns a truthy string, so the condition was
  always true: the function **always returned `browserLang`**, discarding the cookie its own "Why
  good" line claims takes priority, and casting an unvalidated value to `SupportedLocale`. Byte-identical
  in the baseline. Now `return detectLocale(browserLang, cookieLocale)`, routing through the
  validation already above it.
- `presigned-upload.md` (was `s3-upload.md`) — the rewrite removed every S3 mention while keeping S3's
  exact POST-policy syntax, ETag/multipart flow and CORS `ExposeHeaders`. A reader on Azure Blob finds
  none of it applies. The wire format is now named as S3's, and the R2 caveat the rewrite had
  genericised into "not every object store supports…" is restored by name with its documented method
  list.

### Lane S2 — a fifth defect class, and the detector's real precision

**The detector is much weaker than my calibration suggested.** Measured across three lanes:

| Lane | Confirmed / candidates | Precision                                                        |
| ---- | ---------------------- | ---------------------------------------------------------------- |
| S1   | 22 / 67                | 33% (capitalised **22/22**)                                      |
| S3   | ~24 / ~40              | ~60% (the calibration row was **12/16**, not the 6/6 I reported) |
| S2   | 8 / 44                 | **18%** (capitalised 5/16, lowercase **0/22**)                   |

My "6 of 6" was a partial read of a 16-identifier row, quoted as though the row were six long — the
same **result-not-command** error the briefing standard exists to prevent, made in a brief that
restates that standard. The lowercase-is-noise warning held everywhere. The
capitalised-is-high-confidence one held in S1 and failed in S2.

**Nine of S2's twenty-one defects came from reading.** With S1's 9-of-14 and S3's 9-of-18, the answer
is stable across three independent lanes: **a mechanical sweep finds roughly half, and none of the
defects whose falsity depends on an external fact.**

### The fifth class: the correct half of a claim deleted, the incorrect half kept

**This is the finding of the whole pass, and it is invisible to the method both earlier passes used.**
A restore-from-baseline audit looks for content that was _removed_. In this shape what was removed is
the **correct** half, and what survives reads fine in isolation — so the audit sees nothing.
**Three instances confirmed of four proposed** — the fourth was withdrawn when the baseline turned
out to have been wrong on both sides, which is the finding lane declining to inflate its own class:

- `date-fns/examples/timezone.md` — the baseline carried both a correct prose line ("60 for spring
  forward, -60 for fall back") **and** a `tzScan` example with the signs inverted. The rewrite deleted
  the prose and kept the example
- `pwa-offline-first/examples/sync.md` — a correct comment about concurrent vector clocks attached to
  the **identical-vectors** branch
- ~~`date-fns/examples/relative.md`~~ — **withdrawn on verification.** Neither baseline half was
  correct: the prose said "within a week" while `formatRelative` falls back beyond ±6 calendar days,
  and the example annotated a +7-day call as a weekday name. There was no correct half to preserve,
  so it is not an instance — the class _requires_ one. Both halves were wrong and both are now fixed
- `web-accessibility/examples/forms.md` — a rule saying an asterisk takes `aria-hidden` because
  `aria-required` already announces it, and forty lines below, `aria-label="required"` beside
  `aria-required="true"`: the exact double announcement. **Pass 1 fixed one site and not the other**

Filed as its own finding; deliberately not merged with the two dangling-symbol findings, which are a
different class.

### Fabricated numeric claims, each refuted against source

- **`formatDistanceStrict(Feb 15, now) // "31 days"` was _added_ by pass 1** to illustrate that the
  function "never rounds to a friendlier unit". It picks `month` once minutes ≥ `minutesInMonth`
  (43200); 31 days is 44,640, so the real output is **"1 month"** — the added example defeats the
  sentence it was added to support
- **WCAG large-scale text was stated in pixels** — "Text 18px and over → 3:1". The spec defines it in
  **points** (18pt / 14pt bold ≈ 24px / 18.5px), so applying the 3:1 row at 18px is a failure. Now in pt
- **`#999999` on white given as 2.9:1.** Recomputed from WCAG relative luminance: **2.849 → 2.85**,
  which is what the baseline said. Verified independently by the orchestrator
- **A red flag claiming `isWithinInterval` and `areIntervalsOverlapping` throw `RangeError` on an
  inverted interval.** Both **sort the endpoints** in v3.6.0 and v4.1.0 — the real hazard is the
  opposite and worse, silent normalisation. The lane also caught and corrected **its own** first fix,
  which had asserted `eachDayOfInterval` still throws; it does not

### Lane C — the corrections applied, and a lesson about how the audits were run

The three React Router statements, the Angular declaration and the Ant Design deprecation all landed.
The lane re-verified rather than taking the hand-off on trust, and added evidence the audit lane had
not: `registry.npmjs.org/react-router-dom/latest` returns **7.18.3**, whose sole dependency is
`react-router@7.18.3` — the re-export is not merely documented, it is published and resolving today.
Ant Design's v6 API tables show `destroyOnClose` struck through against `destroyOnHidden | 5.25.0` on
both Modal and Drawer.

**The finding that generalises: the Angular snippet had two undeclared identifiers, not one.** U1
reported `elementRef`; `width` was also written by `this.width.set(...)` with no field behind it.
U1 had checked _the identifier it flagged_ rather than every identifier in the snippet — which is the
same partial-verification shape this programme keeps producing, one level up. **Worth applying to the
other lanes' snippet findings before they are trusted as complete.**

**A cross-layer disagreement that was internal to one skill.** React Router's `reference.md` and
`examples/core.md` already carried the correct account — _"deprecated in v7 … still installable, so a
stale import keeps working and gives no signal that it is wrong; v8 deletes the package."_ `SKILL.md`
was the lone outlier, contradicting the two files beneath it. The rewrite did not lose the fact; it
overwrote it in one layer of three.

**One structural point raised and deliberately not acted on:** the corrected red flag sits under
`**Breaks at runtime:**`, and the correction's whole content is that it does _not_ break at runtime in
v7. It arguably belongs under `**Surprising behaviour:**`. Moving it is a structural change beyond a
correction pass.

### Lane S3 — the reading-versus-worklist ratio replicates

**Nine of S3's eighteen defects came from reading, not the worklist — the same split S1 reported
(nine of fourteen).** Two lanes, different skills, same answer: **a mechanical sweep finds about half,
and none of the defects with a checkable external fact behind them.** That is now a measured result
rather than a prediction, and it settles the methodological question this pass was opened to answer.

The detector also **under-reports** in a way the design did not anticipate: it works at identifier
level, so it cannot see a dropped _import specifier_. `combining.md` lost `err` and `Result` from two
import lines while both stayed bound by an earlier block — real breakage, invisible to the tool.

**Four external facts refuted, each verified against primary documentation:**

- `TBT ≤ 300 ms` in a thresholds table — web.dev says **200 ms**. The 300 came from a baseline
  _budget constant_ and the rewrite promoted it into a published threshold. Now `≤ 200 ms`
- `cacheAcrossSpecs` annotated "12.4+" — Cypress's own History table says **10.9.0**. Version claim deleted
- `cacheLife` presets listed as `'max', 'hours', 'days'` in a comment reading as exhaustive — there are
  **seven**
- `next dev --turbo` beside `next build --turbopack` in one file

**And one case where the rewrite was right and the baseline was wrong**, which is worth recording
because this programme has mostly found the reverse: the claim that client-invoked Server Actions
queue rather than parallelising **inverted a false baseline claim**, and Next's own docs recommend
exactly the workaround the rewritten example shows.

The single worst defect was a genericisation that miscounted: `import { Modal } from "../../../components/modal"`
in a block whose own header is `app/@modal/(.)photo/[id]/page.tsx`. Three `../` resolves to
`app/components/modal`; the file declares the target as `components/modal.tsx`. The baseline had
`@/components/modal` and was correct.

### Surface A — the cross-layer lens was the right call, and it is what found almost everything

The three untouched-file lanes returned **25 cross-layer disagreements and 27 factual corrections**
between them. Almost none were concision: these files are code-dominant and their prose was already
telegraphic, which all three lanes reported rather than manufacturing cuts to show activity. U3
withdrew two of its own rewrites on those grounds after finding its replacements were _longer_ than
the originals.

**The defining shape: a rewritten `SKILL.md` promising content its untouched example never had.**
`web-state-pinia`'s `SKILL.md` routes SSR work to `examples/ssr.md` and states the instance is per
request, with a pattern promising "a fresh Pinia per request, and serialised state sanitised before
it reaches the page". The baseline `ssr.md` contained **none of the three** — no `createPinia()` per
request, no serialisation, no rehydration. Verified: the baseline file matches `createPinia|pinia.state.value|devalue`
**zero** times, the current one eleven. Angular had three of the same shape, where `SKILL.md`'s
resource line advertised sections the file did not carry.

**The most consequential factual find is a claim the rewrite introduced, and it is wrong in the
dangerous direction.** `web-routing-react-router`'s `SKILL.md` says `react-router-dom` "is gone" and
"no longer exists in v7". Confirmed against React Router's own documentation before routing it: the
v7 changelog says _"to ease migration, `react-router-dom` is still published in v7 as a re-export"_,
and it is dropped in **v8**. `RouterProvider` is exported from both `react-router` and
`react-router/dom`, and the docs say you almost always want the latter because it wires up
`flushSync`. The skill was telling a reader that a stale import fails loudly. It resolves fine — which
is the whole reason the migration gets skipped.

**Six real bugs, all pre-existing rather than rewrite regressions**, which is the answer to what a
never-audited file accumulates on its own:

- Qwik `routing.md` — `throw requestEvent.redirect(302, …)` sat **inside** the `try`, so its own
  `catch` swallowed the redirect and reported "Failed to create post" on every **success**
- `web-i18n-vue-i18n` — `detectLocale(...) || browserLang !== undefined ? … : …` binds as `(a || b) ? …`
  and `detectLocale` always returns a truthy string, so the cookie its own "Why good" line claims takes
  priority was always discarded
- SSE `fetch-streaming.md` — `disconnect()` nulled the abort controller, so the pending backoff's
  `if (!this.abortController?.signal.aborted)` guard read true and reconnected after an intentional close
- SSE — a 401 handler calling `connect()` unconditionally, looping forever on a permanently-rejected token
- Angular `rxjs.md` — `switchMap((query) => { if (!query) return []; … })`; a bare `[]` as an
  `ObservableInput` emits **zero** values, so clearing the search box left stale results on screen forever
- React Router `data-loading.md` — `async function requireAuth` declared **twice in one code block**

Chakra was the widest single gap: **every overlay was missing its `Positioner`**, the part that
places the content, across seven examples — which is why that one file grew 73 lines.

### A briefing error that cost quality, not just time

Beyond being unable to run the gates, two lanes **withdrew correct table edits** because they could
not verify Prettier's column realignment by hand, re-expressing them as prose or bullet lists. The
check came back clean on 125 files; those tables would have been fine. The lesson is narrower than
"give lanes Bash": a brief that names a gate the lane cannot run does not merely skip a check, it
makes the lane defensive in ways that degrade the work.

### Lane K — the assumed answer was refused, and the refusal was the right call

**The worked example is not coming back, and the lane produced evidence rather than a preference.**
Three reasons, each checkable:

1. **The retired example taught a banned form.** Its flagship "good documentation" block cited
   `toggleSkill(skillId: SkillId)` … `(line ~450)`. `documentation-bible.md` bans source line numbers
   and greps for them. The agent's own instructions were handing out the defect its requirements
   forbid — and a pasted example is exactly where a retired convention survives, because nothing
   sweeps it.
2. **The example was invented rather than cited** — a generic `WizardStore` and a
   `Component Naming 127/134 (94%)` figure matching nothing in this tree. Fabricated-but-plausible
   content is this programme's worst defect class, and that block was an instance of it.
3. **`codex-keeper`'s own playbook forbids it**: _"Where an example teaches a pattern, name the file
   the pattern lives in — that file stays current, and a pasted copy of it does not."_

**The real gap the deletion exposed is different and smaller.** Every one of the 50 documents in
`.ai-docs/reference/` opens with the same five frontmatter fields in the same order — `scope`, `area`,
`keywords`, `related`, `last_validated` — while the playbook named **one** of them and
`documentation-bible.md` hands out the same one-field template. The convention was carried by
imitation alone, so an agent following either instruction literally writes a document missing four
fields its 50 neighbours have. Two of the four do real work: `related:` is the mechanism the bible's
own "cross-reference instead of duplicate" rule assumes and never names, and `keywords:` is the
retrieval index. Nothing checks any of it — `check-findings-frontmatter.ts` parses `agent-findings/`
only, and the completion gate is `typecheck`.

Verified independently before accepting: 50 documents, **all five fields present in all 50**,
`scope: reference` universal, and **266 `related:` targets with 0 dangling**. The fix is an
instruction to read the neighbouring document and match its block, with the five-row table as the
default where a tree has no document yet — no fenced block, and the durable half is the instruction
to read a neighbour, which survives the convention changing. Finding filed at `status: partial`,
proposing the bible's template be widened; that half is `convention-keeper`'s.

---

## Result — seven lanes, measured

|                                | Before pass 3 | After                                                                                                                                        |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Web-skill markdown lines       | 153,270       | **154,079** (+809 — restorations and corrections, as intended)                                                                               |
| Files never opened by any pass | 38            | **2**, both deliberately: `design-tokens`' `reference.md` and `examples/scales.md`, reported as already at the bar and changed by zero lines |
| Confirmed defects fixed        |               | **~90 across 7 lanes**                                                                                                                       |
| Gates                          |               | `prettier --check "src/skills/web-*/**/*.md"` clean; `validate-metadata` **238/238**                                                         |

**The orchestrator ran every gate**, because `skill-summoner` has no Bash tool and all six skills
briefs specified shell commands. One real failure surfaced and was fixed:
`web-meta-framework-vitepress/reference.md`, which U2 attributed to a pre-existing misalignment — the
baseline is prettier-clean, so its own edit caused it.

### What pass 3 establishes

**A mechanical sweep finds about half.** Three independent lanes, three consistent ratios: S1 nine of
fourteen defects found by reading rather than by the worklist, S3 nine of eighteen, S2 nine of
twenty-one. **And none of the defects whose falsity depends on an external fact** — a WCAG threshold,
a library's actual behaviour, a version number — is reachable by any script over this corpus.

**The detector was worth building anyway**, and its precision is now known rather than assumed: 33%,
~60% and 18% across the three lanes, with capitalised type names far more reliable than lowercase
identifiers (S1: 22/22; S2: 5/16 against 0/22). It also **under-reports**: it works at identifier
level, so a dropped _import specifier_ is invisible to it.

**The two surfaces answered differently, which justified splitting them.** The untouched files
carried no programme-introduced defect at all — exactly as predicted — but yielded 25 cross-layer
disagreements and six genuine pre-existing bugs. The rewritten files carried the inventions.

**The fifth defect class is the one that matters beyond this programme.** Both earlier passes audited
by asking "did anything go?". That question cannot see a rewrite that deleted the _correct_ half of a
claim and kept the incorrect half, because what survives reads fine in isolation. Three instances confirmed of four proposed;
filed as its own finding, with the fourth withdrawn on verification.

### Outstanding, filed rather than fixed

`todo/skills.md` **SKILLS-17** through **SKILLS-20**: the `react-query` hollowness (Create-sized), two
skills documenting one major version while demonstrating another, six pre-existing compile-breaking
examples, and three claims that need a source rather than an edit.

## Corrections the orchestrator owes this file

- **I briefed six lanes to run shell gates they had no tool to run.** `skill-summoner` holds
  Read/Write/Edit/Grep/Glob/WebSearch/WebFetch/Skill and no Bash. The cost was not only the unrun
  check: two lanes **withdrew correct table edits** because they could not verify Prettier's column
  realignment by hand, downgrading them to bullet lists. A gate a lane cannot run makes it defensive.
- **My detector calibration was a partial read reported as a whole one.** I hand-checked six
  identifiers on a worklist row that carries sixteen and wrote "6 of 6 are real" into three briefs.
  The row is 12 of 16. S3 caught it. This is the **result-not-command** failure the briefing standard
  names, made in briefs that restate that standard — the second time in this programme.

- **The ~4,000-line figure in the parent was mine and it was wrong** — a single lane's measurement
  quoted as a tree-wide fact. The real figure is 10,190. This is the parent's own standard —
  _"a brief carries the command, not its result"_ — broken in the file that states it.
- **The first recommendation put to the owner was "a substitution sweep over the example files pass 1
  never read", which is incoherent**: those two sets do not intersect. Pass 1 never read them, so
  pass 1 cannot have introduced a substitution into them. The dispatch was split into two surfaces
  once the byte comparison made that obvious.
