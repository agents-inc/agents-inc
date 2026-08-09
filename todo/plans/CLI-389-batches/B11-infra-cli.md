# B11 — infra + CLI (15 skills), researched 2026-08-07 (verified 2026-08-07, amendments applied)

Scope: worksheet §B11, §4; relationship-coverage decision 2; B12's cross-batch handoff
(turborepo-ci). Skill bodies read at `/home/vince/dev/skills/src/skills/` (`infra-ci-cd-*`,
`infra-config-setup-env`, `infra-containers-kubernetes`, `infra-iac-*`, `infra-platform-*`,
`cli-framework-*`, `cli-prompts-clack`). Rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts`: exactly ONE conflict group touches
this batch — `{cli-commander, oclif-ink}` at :44 — plus its matching `alternatives` purpose
group "CLI Framework" at :891. **Zero `requires` and zero `compatibleWith` rules touch any of
the 15, in either direction, and zero `alternatives` groups name any infra skill** (verified by
exact-slug grep over the whole file). Categories verified in `default-categories.ts`:
`infra-ci-cd` [o] order 1, `infra-platform` [o] 2, `infra-config` [o] 3, `infra-iac` **[X]** 4,
`infra-containers` [o] 5; `cli-framework` **[X, required: true]** 1, `cli-prompts` [o] 2.
Stack exposure verified in `default-stacks.ts`: 42 `"infra-ci-cd"` keys all pin
`infra-ci-cd-github-actions`; docker, kubernetes and turborepo-ci appear in **zero** default
stacks; `cli-framework` entries pin oclif-ink. Coexistence claims verified by web search
2026-08-07 (Pulumi's Terraform-state coexistence docs, SST provider/engine docs, Vercel-vs-
Cloudflare hosting guides).

**Headline: one new declaration in the whole batch — `turborepo-ci → requires [turborepo]`,
the B12 handoff, ADOPTED on body evidence (the skill is 100% turbo.json/turbo CLI) and
double-duty as the transitive nx fence once `shared-task-runner` exists. The `infra-iac` radio
SURVIVES all three documented coexistence patterns under the prior verifiers' steady-state
semantics — each dissolves as cross-scope, migration-window, or engine-internal, and each gets
an honest D-306 line. `infra-platform` stays open: multi-cloud is normal and the category is
structurally un-radioable (aws-sdk is a client SDK, not a host; cloudflare-workers is
dual-identity) — and the `{vercel, netlify}` sub-radio is now explicitly priced and declined
(verification amendment). clack is universal; github-actions is recorded as the catalog's canonical
universal exemplar. Two defects surfaced that the worksheet never saw: SKILLS-01's class-C
derivation rule breaks on its own proving case (setup-env), and the batch's only
`required: true` category is enforced nowhere (CLI-367).**

## (a) turborepo-ci — binding ADOPTED, the B12 handoff honored

The body assumption is total, not partial: all six patterns are turbo.json task config,
`TURBO_TOKEN`/`TURBO_TEAM` Remote Cache, `--affected`/`turbo query affected`, `turbo prune
--docker`, cache debugging, and env-mode strategy. "When to use" opens with "Configuring CI
pipelines for a Turborepo monorepo". There is no non-Turborepo content to salvage — class B,
support surface exactly `[turborepo]`.

**Adopted: `turborepo-ci → requires [turborepo]`.** Proposed reason string (citing the
post-B12 category per the handoff): _"Turborepo CI patterns configure turbo.json and the turbo
CLI — requires the Turborepo task runner (`shared-task-runner`)"_. Sequencing note: the
binding is valid **before** B12's split lands too — today `turborepo` sits in the
`{turborepo, nx}` conflict group (default-rules.ts:67-70), so `requires [turborepo]` already
moves turborepo-ci from "–" to "R" (reaches a conflict via requires); after Phase C the same
reach re-keys onto the `shared-task-runner` radio. No ordering dependency between the batches.

Compositions confirmed, no further fences: turborepo-ci is CI-provider-agnostic ("CI
provider-specific workflow syntax (use your CI provider's skill)"; GitHub Actions auto-detect
via `GITHUB_BASE_REF` is a gotcha note with a manual `--filter` fallback for other providers) —
no requires on github-actions. changesets ↔ turborepo-ci compose per B12's handoff
(https://turborepo.dev/docs/guides/publishing-libraries) — recorded, no fence invented. The
`turbo prune --docker` pattern is optional content — no requires on docker.

## (b) infra-iac — radio SUSTAINED; all three coexistence patterns dispatched

The prior verifiers' semantics (B6 §api-orm, verify-B6 1.2/1.4, B12 group #15): _a skill
picker models the steady state of one project_; migration-window coexistence never breaks a
radio; real steady-state coexistence at a different scope or layer gets recorded as a D-306
line while the radio holds. Applied to the three members:

1. **terraform ↔ pulumi — migration window plus a layered pattern, radio holds.** Both
   vendors publish converters/migration paths (`pulumi convert --from terraform`,
   https://www.pulumi.com/docs/iac/get-started/terraform/). The durable coexistence is
   real but layered: Pulumi's `RemoteStateReference` exists specifically so a Pulumi program
   can _consume the outputs of_ a Terraform-managed layer
   (https://www.pulumi.com/blog/using-terraform-remote-state-with-pulumi/,
   https://www.pulumi.com/docs/iac/get-started/terraform/reference-state/) — platform team
   keeps networking in Terraform, app team writes Pulumi. Each resource has exactly one
   owner; the layers are separate state stores, typically separate repos. Within the one
   project the picker models, one engine owns the resources — dual ownership of the same
   resources is the drift disaster the radio prevents. Same disposition as B6's
   drizzle+prisma: radio KEPT, layered TF-state-consumption recorded as a D-306 line.
2. **sst beside org-level terraform — the api-db-host shape, radio holds.** SST is
   application-scoped IaC (one `sst.config.ts` owns the app's infra), and orgs that run
   Terraform for accounts/VPCs/org policy while product teams ship SST apps are real. But
   that coexistence is a scope split — platform repo vs app repo — exactly the shape of
   B6's turso-as-edge-replica-beside-a-primary-host: a real minority pattern at a different
   layer, conceded honestly to D-306, while the radio keeps modeling the steady state of the
   project in hand. The sst body agrees it is an alternative, not a complement, at app scope:
   its when-NOT-to-use names "Existing Terraform/Pulumi codebases where SST abstraction adds
   no value". Two IaC tools owning one app's infrastructure is the incoherent case; radio
   right.
3. **sst ↔ pulumi — embedding, not coexistence; the redis↔upstash shape.** SST v3 (Ion) _is_
   the Pulumi engine with Terraform-bridged providers under the hood
   (https://sst.dev/blog/moving-away-from-cdk/, https://sst.dev/docs/providers/), and the sst
   skill body itself teaches the seam: "No SST component exists for this AWS service → use
   raw Pulumi resource", plus Pulumi `Output` gotchas (`$concat`/`$interpolate` because
   "Pulumi Outputs cannot be used directly in string templates"). So the pulumi skill's
   _programming-model half_ (Outputs, apply/all/interpolate, resource args) applies verbatim
   inside `sst.config.ts` — while its _lifecycle half_ (stacks, backends, `pulumi up`,
   StackReferences, Automation API) contradicts SST's state ownership (you never run `pulumi
up` in an SST app). This is verify-B6 1.4's dual-client-one-provider disposition
   transplanted: radio KEPT, pattern recorded as a D-306 line ("sst embeds the Pulumi
   programming model; half the pulumi skill applies inside sst.config.ts, half must not be
   followed; unrepresentable in current vocabulary") rather than waved off.

All three members therefore verdict `constrained-via-exclusivity-or-requires`, the category
flag stays `exclusive: true`, and the worksheet's "three unaudited orphans riding the radio"
resolves to: the radio is the correct and sufficient fence.

## (c) infra-platform — stays OPEN; the category is structurally un-radioable

Multi-cloud is normal, and the specific pairing the worksheet asked about — aws-sdk beside
vercel — is the _most_ normal thing in the category: S3 uploads/presigned URLs/SES from a
Vercel-hosted app is a canonical stack, and the sst skill's own handler examples import
`@aws-sdk/client-dynamodb`. But "keep it open" is not just an observation about frequency;
a radio was examined and fails structurally:

- **aws-sdk is not a host.** It is a client-SDK skill (command pattern, DynamoDB document
  client, presigned URLs, paginators) that composes with every deployment target — it can
  never sit inside a mutual-exclusion group with the platforms its clients are called from.
- **cloudflare-workers is dual-identity.** It is simultaneously a _host_ (OpenNext makes
  Workers a first-class Next.js deployment target — Vercel's own KB frames Cloudflare as the
  alternative host: https://vercel.com/kb/guide/next-js-on-vercel-vs-cloudflare,
  https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) and an
  _edge-service layer_ (KV, D1, R2, Durable Objects, Queues) that runs beside any primary
  host. A radio containing it over-fences the second identity; a radio excluding it lies
  about the first. **This is §2b #24's tanstack-form problem reached from the opposite
  direction**: no partition of `infra-platform` expresses both identities, and here there is
  not even an existing fence to preserve — so nothing is lost by declining to invent one.
- The honest same-slot tension — vercel ↔ netlify (two Git-centric deploy-the-app platforms;
  the steady state is one primary host per app; monorepo split-hosting and migrations are
  the minority) — goes to D-306 as a dubious-combo line, alongside
  vercel ↔ cloudflare-workers-as-host. Same recording discipline as verify-B6 2.10.

**The `{vercel, netlify}` sub-radio, priced and declined (verification amendment).** The
api-db-host "one primary host" analogy points at an exclusive sub-category over just the two
Git-centric deploy platforms. Weighed explicitly, it fails on three grounds: (a) **every radio
this wave kept, flipped or split reproduces a pre-existing conflict group** (B7's three flips =
groups #11-13; `shared-task-runner` = #15; `shared-lint` = #16; `web-e2e` = #6) — infra is a
zero-rule domain (F1, grep-exact), so a `{vercel, netlify}` radio would be the wave's first
invented fence with no group ancestor and no body demand: a worksheet-scope escalation that
belongs to the owner, not an audit disposition; (b) **the blocked minority is real** —
split-hosting one monorepo across the two platforms (marketing on one, app on the other,
root-directory targeting) is a practiced, documented pattern; (c) **the analogy
under-transfers** — api-db-host _preserved_ 120 pre-existing pair-fences and all its members
are same-slot substitutes, whereas here the fence would be new and the same-slot set is
exactly 2 of 4 members. Reopen triggers: D-306's severity-tier direction (block vs discourage)
is the right vocabulary for vercel↔netlify; a second pure same-slot host joining the category
reopens the question.

Verdicts: all four `universal`. One description note (F4): the category description "Edge
compute and deployment platforms" misdescribes aws-sdk; placement is still right (it is the
AWS peer of the platform anchors and there is no better category), re-cut the description at
apply time.

## (d) clack — universal; the two framework bodies checked both ways

- **cli-commander's body is clack-bundled.** 11 `@clack/prompts` mentions in SKILL.md, 2 of
  its 5 MUSTs are clack-specific (`p.isCancel()` on every call; spinner-stop discipline), and
  its philosophy section has a "When to use @clack/prompts" block. Commander + clack +
  picocolors is taught as one stack — this confirms the CLI-364-era redundancy note: a user
  selecting cli-commander already receives inline clack teaching, and the clack skill is the
  deeper reference (`@clack/core` custom prompts, `group()` composition, progress/tasks/
  taskLog, autocomplete/date/path, AbortSignal).
- **oclif-ink never uses clack.** Zero clack references; its interactive UX is Ink +
  `@inkjs/ui` (Select, TextInput, Spinner). Its only prompt-library mentions are generic
  ("Basic prompts only → a lightweight prompt library suffices") in when-NOT-to-use — an
  acknowledgement that a prompt library is a _lighter alternative_ to Ink, not a dependency.
- **So clack binds to nothing.** It is standalone-usable — cli-commander's own when-NOT-to-use
  says "raw @clack/prompts without Commander" for single-prompt scripts — and legal beside
  oclif-ink too (clack prompts in simple commands, Ink for rich UIs; the one caveat is
  mechanical, not a fence: both take stdin raw mode, so a clack prompt cannot run _during_ an
  active Ink render — sequential use only; content note F9). Verdict `universal`, class A,
  no derived requires. `cli-prompts` stays open.
- **F7 — a direct contradiction between the two bodies, found while answering this.** The
  clack skill's critical requirements mandate "You MUST call `process.exit(0)` after
  `cancel()`"; cli-commander's body mandates `p.cancel(...)` followed by
  `process.exit(EXIT_CODES.CANCELLED)` with `CANCELLED: 4`. A user with both skills gets
  opposing MUSTs for the same event. Skills-repo fix (align on the named-constant non-zero
  exit; B12's cli-reviewing checklist already treats named exit codes as the standard).

`cli-framework` radio (cli-commander ↔ oclif-ink): real and boring — two command frameworks,
one CLI; migration only; the conflict group at :44 is wholly inside the exclusive category and
dies free in Phase C (one of the worksheet's 17 redundant groups). Both members are the CLI
domain's framework anchors — classification omitted per §4, same as react/electron/tauri.

## (e) The universals, and sst's couplings

- **github-actions — the canonical universal exemplar, recorded as such.** EDITOR-06's named
  "genuinely universal" example, confirmed against the body: platform-scoped to GitHub (not a
  catalog skill), delegating provider-specific syntax elsewhere; its Turborepo material is
  example-flavor but more than a passing mention — a dedicated example file
  (`examples/caching.md` — "Remote caching, Turborepo") plus an in-body example block
  (:121-124); still class A under SKILLS-01's test because the mentions are instances of a
  tool-agnostic pattern ("e.g., Turborepo `--affected` or `--filter`"), not a support surface
  (precision from verification). Class A, verdict `universal` — this row is
  the reference row for what a clean universal verdict looks like.
- **docker — universal, but mis-shelved (F2).** Body is containerization: Dockerfiles,
  multi-stage builds, BuildKit, Compose — explicitly delegating orchestration ("Kubernetes-
  specific orchestration patterns (use a Kubernetes skill)") and owning CI only as one
  pattern among ten. It sits in `infra-ci-cd` ("Continuous integration and deployment
  pipelines") while `infra-containers` ("Container orchestration (Kubernetes)") holds one
  member. Recommended move: docker → `infra-containers`, description re-cut to "Containers
  (Docker, Kubernetes)". Cost measured: **zero** default-stacks entries name docker, so the
  move is one metadata `category:` edit + one description re-cut + regen. Node.js/Bun flavor
  in examples is class-A example-flavor, not a binding.
- **kubernetes — universal.** Manifests/Helm/Kustomize; delegates image building "to a
  containerization skill", CI to CI skills, provisioning to IaC — the compositional
  boundaries are drawn correctly in the body itself. `kubernetes → requires [docker]`
  REJECTED: manifests consume OCI images from any builder or registry; the k8s body never
  requires the docker skill's content.
- **setup-env — universal, class C `[nextjs, vite]`, and the first live specimen of a
  SKILLS-01 derivation defect (F5).** The named class-C proving case, confirmed: universal
  core (Zod validation at startup, per-app .env files, .env.example discipline, secrets
  hygiene) plus framework adapters (`NEXT_PUBLIC_*`, `VITE_*`, t3-env for Next.js/Vite —
  both adapter targets are catalog slugs). But SKILLS-01 says the support surface _derives_
  `requires needsAny [adapter set]` — which for setup-env would fence its core use case out:
  a server-only project (a Hono worker validating env with Zod) has neither nextjs nor vite
  and is exactly who this skill serves. **The derivation rule as written over-fences any
  class-C skill whose core is host-neutral, and it breaks first on SKILLS-01's own proving
  case.** `needsAny [nextjs, vite]` REJECTED here; flag handed to CLI-405/SKILLS-01: the
  generation must be conditional (or the vocabulary needs a core-universal marker
  distinguishing "runs only inside one of these hosts" from "has optional wiring for these
  hosts").
- **sst's couplings (the worksheet's direct question): `requires [aws-sdk]` REJECTED —
  the platform-anchor gap.** SST is AWS-bound beyond argument (66 "aws" mentions in SKILL.md;
  every component is `sst.aws.*`; when-NOT-to-use: "SST is AWS-focused with limited
  Cloudflare support"). But the coupling is to AWS _the platform_, which has no catalog
  anchor — `infra-platform-aws-sdk` is a data-plane client-SDK skill, not a platform anchor,
  and an SST app can ship zero SDK calls (`sst.aws.Nextjs` + `sst.aws.StaticSite` sites; the
  linking runtime is `Resource.*` from `sst`, not `@aws-sdk/*`). Binding sst to the SDK
  skill would assert a dependency the product does not have. Same gap B6 hit from the other
  side when it deferred `vercel-kv/vercel-postgres → requires [vercel]`: platform-boundness
  is currently unrepresentable unless the platform skill happens to be the right content
  match. Recorded for D-306 as an advisory ("sst's typical data plane is `@aws-sdk/client-*`
  — the sst skill's own handlers import it; pairing is recommended, not required" — a
  `recommends`-shaped fact with no surviving vocabulary). **Promoted (verification
  amendment): the platform-anchor gap is a named CLI-405/D-306 design input beside F5 (F10)**,
  not a residue line only — it now has two independent specimens from two batches (B6's
  deferred vercel-kv/vercel-postgres → [vercel]; sst → AWS), the same two-specimen bar that
  made F5 a CLI-405 design input. The input: the vocabulary cannot express platform-boundness
  unless a platform skill happens to be the right content match; candidate direction —
  platform/host anchors as binding targets. The advisory line stays as-is.

## Manifest rows

Batch id `infra-cli`, audited `2026-08-07`. 15 skills: 11 class A, 1 class B, 1 class C,
2 framework anchors (classification omitted per §4).

| skill (current id)                                     | category                                                | verdict                                 | class | frameworks     | derived-requires                                      | sources                                                                                                                                                                    | notes                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------- | ----- | -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| github-actions (infra-ci-cd-github-actions)            | infra-ci-cd [o]                                         | universal                               | A     | []             | none                                                  | skill body (pinned actions, OIDC, quality gates); https://docs.github.com/en/actions                                                                                       | **The canonical universal exemplar (EDITOR-06)** — recorded explicitly, per the worksheet's order. Turborepo material is example-flavor incl. a dedicated example file (examples/caching.md) — instances of a tool-agnostic pattern, not a support surface. |
| docker (infra-ci-cd-docker)                            | infra-ci-cd [o] → **infra-containers recommended (F2)** | universal                               | A     | []             | none                                                  | skill body (multi-stage, BuildKit, Compose v2, non-root); https://docs.docker.com/build/                                                                                   | Mis-shelved in CI/CD; move costs one metadata edit (zero stack entries name it). Node/Bun flavor is example-flavor.                                                                                                                                         |
| turborepo-ci (infra-ci-cd-turborepo-ci)                | infra-ci-cd [o]                                         | constrained-via-exclusivity-or-requires | **B** | [turborepo]    | **requires [turborepo]**                              | skill body (turbo.json outputs/env, TURBO_TOKEN, --affected, turbo prune); https://turborepo.dev/docs                                                                      | **The B12 handoff, adopted.** Transitively fences vs nx (today via group :67-70, post-split via `shared-task-runner`). CI-provider-agnostic — no github-actions binding.                                                                                    |
| setup-env (infra-config-setup-env)                     | infra-config [o]                                        | universal                               | **C** | [nextjs, vite] | **none — needsAny REJECTED (F5)**                     | skill body (Zod at startup, NEXT_PUBLIC_/VITE_ prefixes, t3-env); https://zod.dev; https://env.t3.gg                                                                       | SKILLS-01's class-C proving case — and the first specimen showing the class-C derivation rule over-fences host-neutral cores.                                                                                                                               |
| kubernetes (infra-containers-kubernetes)               | infra-containers [o]                                    | universal                               | A     | []             | none                                                  | skill body (apps/v1, securityContext, probes, Helm, Kustomize); https://kubernetes.io/docs/; https://helm.sh/docs/                                                         | Compositional boundaries drawn in-body (image-build/CI/IaC delegated). No docker binding.                                                                                                                                                                   |
| terraform (infra-iac-terraform)                        | infra-iac [X]                                           | constrained-via-exclusivity-or-requires | A     | []             | none                                                  | skill body (HCL, lock files, remote state, moved/import blocks, OpenTofu); https://developer.hashicorp.com/terraform                                                       | Radio sustained. Layered TF+Pulumi coexistence → D-306 (see disposition b.1).                                                                                                                                                                               |
| pulumi (infra-iac-pulumi)                              | infra-iac [X]                                           | constrained-via-exclusivity-or-requires | A     | []             | none                                                  | skill body (ComponentResource, Outputs, interpolate, Automation API); https://www.pulumi.com/docs/; https://www.pulumi.com/docs/iac/get-started/terraform/reference-state/ | Multi-cloud (@pulumi/aws, gcp, azure, kubernetes) — no platform binding. Body never mentions terraform; no smuggled coupling.                                                                                                                               |
| sst (infra-iac-sst)                                    | infra-iac [X]                                           | constrained-via-exclusivity-or-requires | A     | []             | none — aws-sdk binding REJECTED (platform-anchor gap) | skill body (sst.aws.* components, resource linking, sst dev, transforms); https://sst.dev/docs/; https://sst.dev/docs/providers/                                           | AWS-bound with no catalog anchor to bind to. Embeds Pulumi (D-306, disposition b.3); beside-org-terraform is a scope split (b.2).                                                                                                                           |
| vercel (infra-platform-vercel)                         | infra-platform [o]                                      | universal                               | A     | []             | none                                                  | skill body (vercel.json, functions/regions, Routing Middleware, crons, monorepo); https://vercel.com/docs                                                                  | vercel↔netlify same-slot tension → D-306 dubious-combo line (disposition c). Framework-agnostic (auto-detect) — no meta-framework binding.                                                                                                                  |
| netlify (infra-platform-netlify)                       | infra-platform [o]                                      | universal                               | A     | []             | none                                                  | skill body (netlify.toml, .mts functions, Deno edge functions, Blobs); https://docs.netlify.com/                                                                           | Same D-306 line as vercel.                                                                                                                                                                                                                                  |
| cloudflare-workers (infra-platform-cloudflare-workers) | infra-platform [o]                                      | universal                               | A     | []             | none                                                  | skill body (wrangler.jsonc, KV/D1/R2/DO/Queues bindings, Hono integration); https://developers.cloudflare.com/workers/                                                     | **Dual-identity (host + edge-service layer)** — the structural reason infra-platform cannot radio (disposition c).                                                                                                                                          |
| aws-sdk (infra-platform-aws-sdk)                       | infra-platform [o]                                      | universal                               | A     | []             | none                                                  | skill body (modular @aws-sdk/client-*, command pattern, DocumentClient, paginators); https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/                    | Client SDK, not a host — composes with every platform; aws-sdk-beside-vercel is canonical multi-cloud. Category description re-cut (F4).                                                                                                                    |
| cli-commander (cli-framework-cli-commander)            | cli-framework [X, required]                             | constrained-via-exclusivity-or-requires | —     | —              | none                                                  | skill body (Commander v13, parseAsync, EXIT_CODES, wizard state machines, @clack/prompts bundled); https://github.com/tj/commander.js                                      | Framework anchor — classification omitted per §4. Bundles clack teaching (F6); exit-code contradiction with the clack skill (F7).                                                                                                                           |
| oclif-ink (cli-framework-oclif-ink)                    | cli-framework [X, required]                             | constrained-via-exclusivity-or-requires | —     | —              | none — react binding REJECTED                         | skill body (@oclif/core, Ink render/waitUntilExit, @inkjs/ui, ink-testing-library); https://oclif.io/docs/; https://github.com/vadimdemedes/ink                            | Framework anchor. Zero clack content. Radio vs cli-commander real; group :44 dies free in Phase C.                                                                                                                                                          |
| clack (cli-prompts-clack)                              | cli-prompts [o]                                         | universal                               | A     | []             | none                                                  | skill body (@clack/prompts v1 ESM, isCancel, group, progress, @clack/core); https://github.com/bombshell-dev/clack                                                         | Standalone-usable; composes with both framework anchors (raw-mode caveat F9 with Ink). The redundancy beside cli-commander is content overlap, not a fence.                                                                                                 |

## Derived-requires candidates examined and rejected

| candidate                                                       | verdict     | why                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| turborepo-ci → requires [turborepo]                             | **ADOPTED** | Body is wholly turbo-bound (every pattern is turbo.json/turbo CLI); does double duty as the transitive nx fence (B12 handoff). The batch's only new declaration.                                                                                                                                                                 |
| turborepo-ci → requires [github-actions]                        | REJECTED    | Provider-agnostic by its own when-NOT-to-use; GHA auto-detection is a gotcha note with a documented manual fallback.                                                                                                                                                                                                             |
| kubernetes → requires [docker]                                  | REJECTED    | Manifests consume OCI images from any builder/registry; the body delegates image building generically, not to Docker.                                                                                                                                                                                                            |
| setup-env → needsAny [nextjs, vite]                             | REJECTED    | Core is host-neutral (server-side Zod validation is the primary case); the binding would block server-only projects. This is the F5 class-C derivation flag — the rejection is load-bearing for CLI-405's design.                                                                                                                |
| sst → requires [aws-sdk]                                        | REJECTED    | Platform-anchor gap: SST needs AWS-the-platform (no catalog anchor), not the SDK skill; an SST app can ship zero SDK calls. Advisory pairing → D-306 (`recommends`-shaped).                                                                                                                                                      |
| sst → needsAny [pulumi]                                         | REJECTED    | SST embeds the Pulumi engine internally — a product dependency, not a selection dependency; the pulumi skill's lifecycle half (stacks, backends, `pulumi up`) actively contradicts SST's state ownership. D-306 embedding line (disposition b.3).                                                                                |
| oclif-ink → requires [react]                                    | REJECTED    | Ink embeds React's programming model, but `web-framework-react` is the _web_ anchor whose content (DOM, web patterns) is majority-inapplicable in a terminal — and the binding's victim is every oclif project, forced to drag a web framework skill into a CLI stack (verify-B5-B12 item 18's in-catalog-victim discriminator). |
| clack → needsAny [cli-commander, oclif-ink]                     | REJECTED    | Standalone-usable — cli-commander's own body names "raw @clack/prompts without Commander" as a valid mode; oclif-ink never touches it.                                                                                                                                                                                           |
| vercel / netlify / cloudflare-workers → meta-framework bindings | REJECTED    | All three are framework-agnostic hosts (auto-detect/adapters); binding any to nextjs-class skills would invert reality.                                                                                                                                                                                                          |

One adopted, eight rejected — several rejections are precedent-setting (F5, the platform-anchor
gap) rather than routine.

## Findings

- **F1 — infra is a zero-rule domain.** None of the 12 infra skills appears in any
  `conflicts`, `requires`, `compatibleWith` or `alternatives` entry, in either direction
  (exact-slug grep over default-rules.ts: the only batch hits are cli lines :44 and :891).
  The domain's entire fencing today is one category flag (`infra-iac`). Consistent with the
  worksheet's 12-neither/3-category-fenced arithmetic.
- **F2 — docker is mis-shelved in `infra-ci-cd`.** Containerization body beside a
  "CI/CD pipelines" category description, while `infra-containers` holds one member.
  Recommended: move docker to `infra-containers`, description "Containers (Docker,
  Kubernetes)". Measured cost: 1 metadata `category:` edit + 1 description re-cut + regen;
  zero default-stacks entries reference docker. Apply-phase decision.
- **F3 — three D-306 lines from the infra-iac radio** (disposition b): layered
  terraform+pulumi via `RemoteStateReference`; sst-beside-org-terraform as a scope split;
  sst-embeds-pulumi (half the pulumi skill applies inside `sst.config.ts`, half must not be
  followed). All three recorded so the radio's survival is honest, not convenient.
- **F4 — `infra-platform`'s description ("Edge compute and deployment platforms") misfits
  aws-sdk**, a client-SDK skill. Placement stays (no better category; it is the AWS peer of
  the platform anchors); re-cut the description at apply time.
- **F5 — SKILLS-01's class-C derivation rule breaks on its own proving case.** "Class C →
  adapters derive `requires needsAny [...]`" is written unconditionally; setup-env's adapter
  surface `[nextjs, vite]` would then fence the skill out of server-only projects — its core
  audience. The derivation must distinguish "runs only inside one of these hosts" (tailwind-
  like, derive) from "has optional wiring for these hosts" (setup-env-like, derive nothing).
  Handed to CLI-405/SKILLS-01 before any generation code exists.
- **F6 — cli-commander bundles clack teaching** (11 mentions, 2/5 MUSTs); the clack skill is
  the deeper reference. Real redundancy, benign overlap, no fence — matches the CLI-364-era
  residual note. If the skills repo ever slims cli-commander to command-structure-only, the
  pairing becomes clean composition.
- **F7 — opposing MUSTs across the two bodies:** clack mandates `process.exit(0)` after
  `cancel()`; cli-commander mandates `process.exit(EXIT_CODES.CANCELLED)` (4). A dual-skill
  agent holds contradictory critical requirements for the same event. Skills-repo fix: align
  on the named non-zero code.
- **F8 — the batch's only `required: true` category is enforced nowhere.** `cli-framework`
  carries `required: true`, but per CLI-367 `validateBuildStep` has no production caller and
  `StepBuild` advances unconditionally — the flag is currently decorative. Not this audit's
  vocabulary, but the manifest should not imply the requirement is live.
- **F9 — clack + Ink raw-mode caveat.** Both claim stdin raw mode; a clack prompt cannot run
  during an active Ink render (sequential use is fine). Content note only; no fence.
- **F10 — the platform-anchor gap, promoted to a named CLI-405/D-306 design input
  (verification amendment).** Two specimens from two batches meet the two-specimen bar that
  promoted F5: B6's deferred `vercel-kv/vercel-postgres → requires [vercel]` and sst → AWS.
  Platform-boundness is unrepresentable unless a platform skill happens to be the right
  content match; candidate direction: platform/host anchors as binding targets. Rides beside
  F5 into CLI-405's design inputs; the D-306 `recommends`-shaped advisory lines stay.

## Contradicts-the-worksheet

1. **"clack pairs with cli-commander/oclif-ink — binding or universal?" — the premise is
   half-wrong.** clack pairs _with cli-commander_ (whose body already bundles it) and is
   merely _compatible with_ oclif-ink (zero references; Ink is its own UX layer). Universal,
   class A, no binding — and the interesting yield was F6/F7, not the verdict.
2. **"infra-iac exclusive — defensible, but three unaudited orphans riding it" resolves
   stronger than defensible:** all three documented coexistence patterns dissolve under the
   steady-state semantics (migration window / scope split / engine embedding), so the radio
   is confirmed the correct and sufficient fence, with the residue in D-306 rather than in
   weakened category semantics.
3. **"infra-platform — should it be exclusive?" — no, and it structurally cannot be.** The
   blocker is not multi-cloud frequency but membership shape: aws-sdk can never radio, and
   cloudflare-workers' dual identity means every partition either over-fences a real pattern
   or misnames itself — §2b #24's inexpressibility, met here with no pre-existing fence to
   mourn. The worksheet's "four mutually-substitutable hosts" miscounts: at most three are
   hosts, and only two are same-slot-only.
4. **Not in the worksheet: the class-C derivation defect (F5).** B11 is the first batch to
   audit a class-C skill in practice, and the unconditional `needsAny` derivation fails on
   setup-env — SKILLS-01's own proving case. CLI-405 must not be built as specified.
5. **Not in the worksheet: docker mis-shelved (F2)** while `infra-containers` sits at one
   member; and **`cli-framework`'s `required: true` is decorative (F8)** per CLI-367.

## Migration surfaces (named, NOT fixed here)

Lightest batch so far — one rule, zero id changes, zero stack edits.

- **M1 — the one new `requires` rule** (turborepo-ci → turborepo, reason citing the task
  runner) into `default-rules.ts`'s requires section; all 15 verdicts into the audit
  manifest; regen `generate:types` + `generate:matrix` + `generate:schemas`. Consistency
  gate: target sits in `shared-monorepo` today / `shared-task-runner` post-B12 — not in the
  subject's own category; no sequencing dependency on B12's split (the reach is valid under
  both shapes).
- **M2 — if F2's docker move is taken:** 1 metadata `category:` edit, `infra-containers`
  description re-cut, regen. Zero default-stacks entries affected (verified).
- **M3 — description re-cuts:** `infra-platform` (F4); `infra-containers` (with M2).
- **M4 — skills-repo content notes (not this repo):** F7 exit-code alignment, F6 slimming
  option, F9 raw-mode caveat, and the D-306 advisory for sst↔aws-sdk pairing.

## Cross-batch handoffs

- **← B12 (shared-meta): both handoffs honored.** turborepo-ci's binding adopted with the
  category-citing reason string; changesets ↔ turborepo-ci recorded as composing (no fence
  invented in either direction).
- **→ CLI-405 / SKILLS-01: the F5 derivation flag** must land before any support-surface →
  `needsAny` generation code is written; setup-env is the counterexample to the current spec.
  The platform-anchor gap (F10) rides beside it as the second named design input.
- **→ apply phase / B6 continuity:** B6's deferred `vercel-kv/vercel-postgres → requires
[vercel]` line stays B6's (subjects are B6's, target is this batch's vercel) — nothing for
  B11 to adopt; noted so it does not fall between batches. The platform-anchor gap it shares
  with sst→aws is one named design input (F10), not two themes.
- **→ D-306:** six lines from this batch — layered terraform+pulumi, sst-beside-org-terraform,
  sst-embeds-pulumi, vercel↔netlify dubious combo, vercel↔cloudflare-workers-as-host, and
  the sst↔aws-sdk `recommends`-shaped advisory.
