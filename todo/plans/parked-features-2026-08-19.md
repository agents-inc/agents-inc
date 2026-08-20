# Parked — genuinely new capability, 2026-08-19

**This file was 58 items and is now four.** The first triage parked everything whose remaining work
was "the guard, the test, or the mechanism the finding proposed" — which was almost all of it. The
owner corrected the line: **a new guard is not a new feature.** A test, a lint rule, a checker, a
fixture capability and a written standard are all in scope for a fixes-and-refactors round; only a
new user-facing capability is not. 54 of the 58 went back into the work.

What is left genuinely gives the user something that does not exist today.

## `2026-08-16-the-seed-contract-cannot-carry-half-of-what-a-config-holds`

Items 1 and 6 closed and the enum-alignment doc row is correct; items 2 and 3 remain missing wire capability — `model: "inherit"` has no spelling and `agentsSource` has no field — and closing either means new schema fields and a SEED_VERSION bump the editor and worker share.

## `2026-04-21-propagation-skipped-observability-gap`

Its central claim is false today — `skipped` IS surfaced at the command layer — but the wizard save path (init/edit) still discards the whole GateReport, so a project skipped during an init/edit fan-out is still invisible; adding that warn is a new signal, and Option B (auto-deregister) is a new capability.

## `2026-04-21-registerProjectPath-sweep-observability-gap`

The claim is still true but every remedy it offers (Options A/B/C) is a NEW user-visible signal — a verbose line, a warn, or a `droppedStale` return field — none of which exists; nothing is wrong, a signal is missing.

## `2026-08-18-half-the-health-check-routing-table-cannot-be-reached-through-a-source-on-disk`

Nothing is wrong — the routing landed with an exhaustive switch — and the residual is a reachability column the finding itself gates on "if anyone acts on this".
