# REPO-44 — what runs next (2026-10-22)

Owner, 2026-10-22: the card rework before the refactors; both repositories; eight sub-agents at a
time. **Every commit round is a release** (version bump, changelogs) that the owner publishes to npm.
One workflow carries the CLI work (`wf_c865fc69-672`, continued as `wf_ccc62c7e-16b` from the
session's `r44/wf-next-cont.js`); this file is its tracker. Rows are deleted as they land (one line
to [`archive.md`](../archive.md)); the run log is [`REPO-44-progress.md`](./REPO-44-progress.md).
Card answers: [`outstanding.md`](../outstanding.md), verbatim in the session's
`r44/cards2/answers-round*.json`. Commit rounds: one planner, minutes, about 10–20 commits, no tests
(root CLAUDE.md); the owner commits, pushes and publishes.

## 1. Phase A — card rework and fixes (CLI) — built, reviewed and fixed; Phase D reproduces each

| Lane | Work |
| --- | --- |
| A1 editor selection | E1 toasts (on: first three names, then "and N more"; off: "X switched off: Y removed"); Q1 a stack's sub-agents stay on with no skills |
| A2 editor links | E2 a project-made link shows its global items disabled (switch to project scope allowed); R1 also matches a signed-in account's saves |
| A3 link text | FU1: codexModel warning and carried display names printed sanitised, line breaks folded (security) |
| A4 doctor | F5a remove this round's skill-folder addition; F5b doctor never uses the saved marketplace copy; doctor's error on two healthy installations |
| A5 install and load | F3d sub-agents install without a skill that fails to load (warning, no refusal); F9 a project keeps its own description; FU2 carried names over 30 characters |
| A6 build and misc | P1 agent plugins version by shipped files and drop stale output; Q5 empty marketplace config refused at build; E3 local worker ⇒ local editor everywhere, `AGENTS_INC_EDITOR_URL` removed; `list` long names; FU6 |
| A7 worker and e2e | FU4 worker refuses escaping ids and file keys; FU5 PostToolUse-only trust case, `completionGate` → `stopHook` |
| A8 confirm screens (after A3) | Info panel at the question for init/edit/uninstall (`~` plus a line for changed sub-agents; F3c whole global install); F3b "recompiled"; FU3 remedies; no-terminal no-op; the home refusal's advice |
| A9 www root (done: `/` 301 → `/editor` via `public/_redirects`; editor's About link → `/docs/why`, a call the owner may change) | agentsinc.sh/ goes straight to the editor; the landing page is removed; /docs stays; every link to / fixed |

## 2. Phase B gate and 2b pre-release verify — done

`wf_9905899c-6ab` reproduced A1–A9 against the owner's answers, fixed and re-checked; the
pre-release gate is green (unit headless and at 120 columns with `--force`, all e2e, coverage
floor). Still failing on recheck, moved to Phase D: E1-d on a link the CLI minted (owner question,
open-questions page); E2's marketplace switch drops a project link's held global skills
(`pruneToCatalog`); F5b giget's saved tarball read after one failed download; F9 the editor
preview's `resolveDescription` order; FU2 doctor's Codex block beside a Claude installation in one
project (`discoverLocalSkills` ignores the provider).

## 3. Commit round 1 — CLI 0.172.0 (committing now; owner, 2026-10-22: follow the commit protocol, then push)

Once the gate is green and A9 has landed: commits by area (editor, link text, doctor, install and
load, build and misc, worker and e2e, confirm screens, www root, findings, `todo/`), then
`chore(release): 0.172.0` (minor: the card rework changes what users see). The owner commits,
pushes and publishes; then the run resumes at Phase C.

## 4. Phase C — expressive-ts round 3, then its gate

Patterns 5, 6, 8 and the red flags; eight lanes at once, each reviewed and fixed.

## 5. Phase D — verify and finish

Fix the five items §2 lists (E1-d only once the owner rules); reproduce every Phase A item against
the owner's answers word for word; the full gate; up to three rounds; docs where false; recompile
`.claude/agents`.

## 6. Commit round 2 — CLI 0.172.1

Round 3's refactors, the verify fixes, docs, the recompiled agents; `chore(release): 0.172.1`
(patch; 0.173.0 if the verify fixes change behaviour). The owner commits, pushes and publishes.

## Later (owner)

Candidate lint rules; running lint-rules against the repositories (then REPO-44 step 5's rules); the
`CLAUDE.md` and `.ai-docs` slim (REPO-44 step 3). Open questions: https://claude.ai/artifact/BT8ZY5tazeBkXzgG6ZE8zp.
