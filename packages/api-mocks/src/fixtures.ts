import { CATALOG } from "@workspace/matrix"
import { matrixSchema } from "@workspace/matrix/matrix-schema"
import { SEED_VERSION, seedPayloadSchema } from "@workspace/matrix/seed"
import { skillIndexSchema } from "@workspace/matrix/skill-index"

import type { SeedPayload } from "@workspace/matrix/seed"

// What the worker (apps/server) answers with, and nothing about how a caller
// intercepts it. This module names no mocking library on purpose — first
// because the Playwright suite kept its own `page.route` interception and
// wanted only these values, and now because a fixture is a VALUE: anything that
// is not testing can read one, and a module that drags msw in cannot be read
// that way. The Playwright suite answers from the handlers beside this file
// since 2026-08-29; the rule about this file survived that change.
//
// GitHub is the exception to "the worker": a marketplace's `catalog.json` is
// fetched browser-direct so org content never transits our worker, which makes
// api.github.com a second origin this app really talks to — and the only one
// whose answers a token changes.

// Where the worker answers in local development — the same origin
// `apps/editor/src/env.schema.ts` defaults `VITE_API_URL` to, which is what
// both the editor's unit suite and its Playwright suite therefore talk to.
// A deployment points the app elsewhere; nothing mocks a deployment.
export const WORKER_ORIGIN = "http://localhost:8787"

// 8 base64url characters, because the worker's id is a truncated content hash
// and its response schema says exactly that length.
export const STORED_ID = "Ab3xY9_Q"

// An id the store does not hold. Nothing distinguishes it from a typo, which is
// the point: the worker answers 404 for any id it has never seen.
export const DEAD_LINK_ID = "gone0000"

// An id whose stored bytes no longer parse as a seed payload. Unreachable in
// production by construction — the key is the payload's own hash — so the
// worker treats it as an integrity failure of its own and answers 500.
export const UNREADABLE_CONFIG_ID = "corrupt0"

// The worker's own bodies, mirrored rather than invented: a test asserting on
// what the client makes of a status is only worth something if the status
// arrived attached to what the worker really sends.
export const NO_CONFIG_BODY = "No config under this id"
export const UNREADABLE_CONFIG_BODY = "Stored config is unreadable"
export const STORE_REFUSED_BODY = "Could not store this config"

// A payload as the worker would return it: real catalog ids, since the app
// prunes anything its catalog does not know.
//
// v2 moved model and effort off the skill and onto the agent, and gave agents
// their own top-level map. Both kinds of entry are here: an agent that travels
// only its overrides (derived on by the assignment below) and one that travels
// as `on: true` with nothing else — a bare base agent, which v1 could not
// express at all.
//
// Parsed rather than asserted. The worker stores the *validated* payload and
// serves it back, so running the shared schema over this fixture is the same
// step the real response has already been through — and a fixture that drifts
// from the contract fails at import in every consumer rather than in whichever
// assertion happens to read the changed field.
//
// `web-developer` is pinned into the project, and that is load-bearing rather
// than flavour: the skill below is project-scoped, and a project skill never
// reaches a sub-agent whose front-matter is written to ~/.claude. Without the
// pin this fixture is a payload `init --from` THROWS on
// (`seedToWizardResult` -> `unwritableAssignmentsError`), which is not what the
// canonical "a configuration the worker holds" fixture should be — it is the
// EDITOR-08 defect, frozen into the one payload both suites read.
//
// A builder rather than a constant, because the same payload was being re-typed
// wherever one field of it had to differ: apps/server's own suite wants a stack
// id on it, and each packages/cli e2e spec that publishes one wants its own
// skills. Every copy restated the five fields it was not changing, and every
// copy was free to drift from this one and from the contract.
export const seedPayload = (
  overrides: Partial<SeedPayload> = {}
): SeedPayload =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: "1.0.0",
    stackId: null,
    skills: {
      "web-framework-react": {
        install: "plugin",
        scope: "project",
        assignments: { "web-developer": "preloaded" },
      },
    },
    agents: {
      "web-developer": { model: "haiku", effort: "max", scope: "project" },
      "api-developer": { on: true },
    },
    ...overrides,
  })

/** The one the config mock serves under {@link STORED_ID}. */
export const STORED_PAYLOAD = seedPayload()

// The federated skill index — `GET /skills`, the add-skills dialog's search
// surface. Every entry names a real skill in a real allowlisted repository,
// because an entry reaches the index only if its SKILL.md was read: a fixture
// of invented coordinates would mock a response the worker cannot produce.
//
// Small on purpose. The route serves the whole index and the dialog filters it
// in the browser, so what a test needs is enough entries to filter BETWEEN, not
// the fifty-eight the real repositories hold.
//
// `bytes` is each directory's real weight, measured against the live git trees
// on 2026-08-18 — so `docx` really is past `MAX_EXTERNAL_SKILL_BYTES` and the
// other three really are inside it. Five of the fifty-eight indexed skills are
// past that cap, and an index of uniformly small ones would let a dialog that
// never checks look correct.
//
// Parsed rather than asserted, for the same reason `STORED_PAYLOAD` is.
export const SKILL_INDEX = skillIndexSchema.parse({
  builtAt: "2026-08-08T09:00:00.000Z",
  skills: [
    {
      name: "brainstorming",
      description:
        "Explores user intent, requirements and design before implementation.",
      repo: "obra/superpowers",
      path: "skills/brainstorming",
      stars: 268868,
      bytes: 80159,
    },
    // A code library wearing a SKILL.md: 1.1 MB across sixty-one files, almost
    // all of it XML schemas. The one entry here that can never be added, which
    // is what makes the mark on the search row testable at all.
    {
      name: "docx",
      description:
        "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents.",
      repo: "anthropics/skills",
      path: "skills/docx",
      stars: 166923,
      bytes: 1128695,
    },
    {
      name: "code-review-and-quality",
      description:
        "Conducts multi-axis code review. Use before merging any change.",
      repo: "addyosmani/agent-skills",
      path: "skills/code-review-and-quality",
      stars: 84036,
      bytes: 20555,
    },
    // Addable by weight, and from a repository the CONTENT stub does not serve
    // — which is the pair a spec needs to reach the late refusal on its merits.
    // `docx` used to play that part and no longer can, now that the dialog
    // refuses it before anything is staged.
    {
      name: "webapp-testing",
      description:
        "Toolkit for interacting with and testing local web applications using Playwright.",
      repo: "anthropics/skills",
      path: "skills/webapp-testing",
      stars: 166923,
      bytes: 22394,
    },
  ],
})

// The same index a week later with nothing rebuilt — what the worker serves
// once the daily build has stopped landing. The body is a normal index and only
// `builtAt` and the freshness header say otherwise, which is the point: a
// caller that ignores both still gets usable results.
export const STALE_SKILL_INDEX = skillIndexSchema.parse({
  ...SKILL_INDEX,
  builtAt: "2026-08-01T09:00:00.000Z",
})

// The worker's own body for the one case it refuses outright: nothing cached
// AND an upstream that will not answer.
export const SKILL_INDEX_UNAVAILABLE_BODY =
  "The skill index is not available yet"

// Who is signed in, when somebody is. GitHub is the only provider the worker
// offers, and a name and an id are the whole of what the editor draws —
// `sessionSchema` in apps/editor/src/lib/api/auth.ts reads those two and
// deliberately names nothing else.
export const SIGNED_IN_USER = {
  id: "u_1",
  name: "Vincent",
  email: "v@example.com",
} as const

// `GET /api/auth/get-session` when somebody is. Only `user`, because Better
// Auth returns a great deal more and a fixture naming the rest would be a
// second copy of somebody else's contract to keep in step — the same reason
// the editor's own schema stops at two fields.
export const SIGNED_IN_SESSION = { user: SIGNED_IN_USER }

// And when nobody is. A 200 carrying `null` rather than a 401: signed-out is
// the state this app is fully usable in, so the session read is a question
// with two ordinary answers rather than a gate.
export const NO_SESSION = null

// The body behind every 401 the worker sends. `authenticated` in
// apps/server/src/auth.ts writes it, and the four stack routes and `/compose`
// all go through that wrapper — so the bytes are the same on all five, even
// though their OpenAPI declarations disagree about the shape (a
// `z.literal("unauthorized")` against a bare `z.string()`; SERVER-05).
export const UNAUTHORIZED_BODY = { error: "unauthorized" } as const

// Where `POST /api/auth/sign-in/social` sends the browser.
//
// GitHub's own authorize URL, and it is asked for rather than built on either
// side: Better Auth mints the `state` per attempt, which is exactly the half
// of OAuth that stops one person's request being replayed as another's. This
// side only checks the field is a URL and navigates, so the query is a shape
// rather than a value anything reads.
export const GITHUB_AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize?client_id=Iv1.0123456789abcdef&state=t9Yb2Qw4&scope=user%3Aemail"

// When a saved stack was saved, and when a rename moved it. Two instants
// rather than one, because `updatedAt` is what the worker sorts on and what a
// rename changes — a fixture whose timestamps all match cannot show either.
export const STACK_SAVED_AT = "2026-08-28T00:00:00.000Z"
export const STACK_RENAMED_AT = "2026-08-29T00:00:00.000Z"

/**
 * A saved stack: A NAME AND A POINTER.
 *
 * The configuration itself lives in KV under the id `POST /configs` minted,
 * and is read back with the same `GET /configs/:id` a share link uses — so
 * nothing here serializes a configuration and nothing here can drift from the
 * payload contract, because none of it knows the contract. See
 * apps/server/src/stacks.ts.
 *
 * A function rather than a constant because the worker mints the row from what
 * the caller sent, so a POST's answer depends on its request. The id is
 * derived from the name where the worker uses `crypto.randomUUID()`: nothing
 * on either side reads its form — both schemas say `z.string()` — and a
 * derived one is the same claim carrying a value an assertion can name.
 */
export const savedStack = (
  name: string,
  configId: string = STORED_ID,
  at: string = STACK_SAVED_AT
) => ({
  id: `s_${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  configId,
  createdAt: at,
  updatedAt: at,
})

export type SavedStack = ReturnType<typeof savedStack>

// Two, because a list of one proves nothing about order, and they are in the
// order `GET /stacks` really returns them: the worker sorts newest-first on
// `updatedAt`, so the timestamps are what puts them in it.
//
// Both point at `STORED_ID`, the one configuration the config mock actually
// serves — a stack whose pointer 404s is a stack nobody can open.
export const SAVED_STACK = savedStack("Weekend project")
export const OTHER_SAVED_STACK = savedStack(
  "Client work",
  STORED_ID,
  "2026-08-27T00:00:00.000Z"
)
export const SAVED_STACKS = [SAVED_STACK, OTHER_SAVED_STACK]

// An id this person's account does not carry. Indistinguishable from somebody
// else's id, which is the whole point: the worker scopes the mutation itself
// and answers 404 to both, because telling a stranger that a stack exists but
// is not theirs is telling them it exists.
export const MISSING_STACK_ID = "s_not-yours"

// The worker's own body for that 404.
export const NO_STACK_BODY = { error: "not found" } as const

// What `POST /compose` answers with: skill ids, and one sentence saying why.
// Nothing about scope, install mode or which sub-agent carries what — those
// are the tool's to decide, and the route discards any opinion the model
// offers about them.
//
// The ids are checked against the catalogue AT IMPORT, because the worker
// filters the model's answer through `CATALOG.skillsById` before replying: an
// id the catalogue does not hold is one this route cannot return, so a fixture
// carrying one would mock a response the worker cannot produce.
const catalogueSkillId = (id: string) => {
  if (id in CATALOG.skillsById) return id
  throw new Error(`Not a catalogue skill id: ${id}`)
}

export const COMPOSED_PROPOSAL = {
  skillIds: [
    catalogueSkillId("web-framework-react"),
    catalogueSkillId("web-testing-vitest"),
  ],
  reason: "React for the app, and Vitest to test it.",
}

// The worker's own bodies for the two compose refusals a caller can tell
// apart from each other. Its 400s are absent for the reason `GET /configs/:id`
// has no 503 here: the client maps every status it does not name to one
// `refused`, so a handler for those would assert the same branch twice.
export const COMPOSE_TOO_MANY_BODY = { error: "too many requests" } as const
export const COMPOSE_FAILED_BODY = {
  error: "the model did not answer",
} as const

// Where GitHub's REST API answers. Named once because it is the origin the
// editor reaches DIRECTLY — the whole point of fetching a catalogue this way is
// that org content never passes through anything of ours.
export const GITHUB_API_ORIGIN = "https://api.github.com"

// The marketplace the specs load, in the form the dialog accepts.
export const MARKETPLACE_REF = "acme/skills"

// A marketplace nobody can read: GitHub answers 404 for a repository that does
// not exist AND for a private one an unauthorized caller asked about, which is
// exactly why a 404 has to offer the token rather than declare the name wrong.
export const PRIVATE_MARKETPLACE_REF = "acme/private-skills"

// The same two marketplaces as `--marketplace` takes them, which is what the
// editor stores and what it mints.
//
// Written out rather than derived from the two above, because a fixture is a
// statement OF the wire value: one built by calling the app's own formatter
// could only ever agree with it.
//
// The prefix is the whole of the difference and it is not cosmetic. The CLI
// routes a ref on its protocol, and one carrying none is a LOCAL DIRECTORY — so
// a payload naming a bare `owner/repo` sends its receiver looking for
// `<cwd>/acme/skills`, which fails in the worst way available: by resolving to
// something rather than to nothing. Two constants because they are two forms
// with two meanings, not one string doing two jobs.
export const MARKETPLACE_CANONICAL_REF = "github:acme/skills"
export const PRIVATE_MARKETPLACE_CANONICAL_REF = "github:acme/private-skills"

// The token the private marketplace accepts. A real PAT shape, because the
// header is built from whatever the user pasted and a fixture that could not be
// pasted proves nothing.
export const MARKETPLACE_TOKEN = "ghp_000000000000000000000000000000000000"

// A marketplace's `catalog.json` exactly as `build marketplace` emits it: the
// matrix, as JSON, with `generatedAt` stamped. No transform sits between this
// and the editor's `safeParse`, which is what makes the fixture faithful rather
// than a convenience.
//
// Every skill id carries the marketplace's name as a prefix (CLI-498), so these
// ids can never collide with the public catalogue's unprefixed ones — which is
// what makes "the grid swapped" observable rather than a matter of counting.
//
// Parsed rather than asserted, for the reason `STORED_PAYLOAD` is: a fixture
// that drifts from the shared contract fails at import in every consumer.
export const MARKETPLACE_CATALOG = matrixSchema.parse({
  version: "9.9.9-acme",
  generatedAt: "build",
  categories: {
    "acme-web-framework": {
      id: "acme-web-framework",
      displayName: "Acme Framework",
      description: "The frameworks Acme builds on.",
      domain: "web",
      exclusive: true,
      required: false,
      order: 1,
    },
    "acme-api-runtime": {
      id: "acme-api-runtime",
      displayName: "Acme Runtime",
      description: "Where Acme services run.",
      domain: "api",
      exclusive: false,
      required: false,
      order: 2,
    },
  },
  skills: {
    "acme-web-widgets": {
      id: "acme-web-widgets",
      slug: "acme-web-widgets",
      displayName: "Acme Widgets",
      description: "Acme's in-house component library.",
      category: "acme-web-framework",
      conflictsWith: [],
      discourages: [],
      requires: [],
    },
    "acme-web-legacy-widgets": {
      id: "acme-web-legacy-widgets",
      slug: "acme-web-legacy-widgets",
      displayName: "Acme Legacy Widgets",
      description: "The library Acme Widgets replaced.",
      category: "acme-web-framework",
      conflictsWith: [
        { skillId: "acme-web-widgets", reason: "Two component libraries" },
      ],
      discourages: [],
      requires: [],
    },
    "acme-api-gateway": {
      id: "acme-api-gateway",
      slug: "acme-api-gateway",
      displayName: "Acme Gateway",
      description: "Acme's edge runtime.",
      category: "acme-api-runtime",
      conflictsWith: [],
      discourages: [],
      requires: [],
    },
  },
  suggestedStacks: [
    {
      id: "acme-house-stack",
      name: "Acme House Stack",
      description: "What every Acme service starts from.",
      skills: {
        "web-developer": { "acme-web-framework": ["acme-web-widgets"] },
        "api-developer": { "acme-api-runtime": ["acme-api-gateway"] },
      },
      allSkillIds: ["acme-web-widgets", "acme-api-gateway"],
      philosophy: "One way to build a service.",
    },
  ],
})

// What `edit --ui` hands over: ids from a marketplace's catalogue, and the
// marketplace named at the top so a receiver knows which catalogue can resolve
// them. Every id carries the marketplace's own name as a prefix (CLI-498), so
// none of them exists in the public catalogue — which is what makes "the
// catalogue was loaded before the ids were read" observable rather than a
// coincidence of counting.
const [ACME_SKILL_ID] = Object.keys(MARKETPLACE_CATALOG.skills) as [string]

export { ACME_SKILL_ID }

/** An id no catalogue carries — the drift a payload has to survive out loud. */
export const RETIRED_SKILL_ID = "acme-web-retired"

// The ids these payloads are stored under, beside `STORED_ID` for the reason
// it is here: an id is what a link carries, and a suite that made one up per
// spec would have no way of holding two of them apart.
export const MARKETPLACE_IMPORT_ID = "AcmeMk_1"
export const PRIVATE_IMPORT_ID = "AcmePv_2"
export const DRIFTED_IMPORT_ID = "AcmeDr_3"

// Parsed rather than asserted, for the reason every fixture beside it is: a
// payload that drifts from the shared contract fails here rather than in
// whichever assertion happens to read the changed field.
const marketplacePayload = (marketplace: string, skillIds: string[]) =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MARKETPLACE_CATALOG.version,
    stackId: null,
    marketplace,
    skills: Object.fromEntries(
      skillIds.map((skillId) => [
        skillId,
        {
          install: "plugin",
          scope: "project",
          assignments: { "web-developer": "preloaded" },
        },
      ])
    ),
    agents: {},
  })

// All three take the CANONICAL ref, never the bare one the dialog accepts.
//
// A payload is what the editor MINTS, and what it mints is what its marketplace
// store holds — the canonical form. These three were built from the dialog's
// input form instead, which is a different string with a different meaning: the
// CLI routes a ref on its protocol, so a bare `acme/skills` is a LOCAL
// DIRECTORY and a receiver looks for `<cwd>/acme/skills`.
//
// Nothing could see it. `seedPayloadSchema` types `marketplace` as a string
// because all three spellings are legal, so the schema both suites share — the
// thing that holds every other field of this payload honest — is structurally
// unable to tell them apart. The editor's specs never install, so a ref that
// only a receiver refuses reads as fine there; and the CLI's own end-to-end
// specs build their payloads with an absolute local directory, a legal ref
// taking the local branch, so nothing there ever carried this one.
//
// That is EDITOR-49 exactly, which is the reason this comment is long: every
// custom-marketplace id the editor minted was uninstallable, both suites were
// green throughout, and the defect had come back into the canonical fixture.
// `packages/cli/src/cli/lib/seed/marketplace-ref-crossing.test.ts` is what
// holds it now, by asking the CLI's own router what these refs are.

/** A marketplace anyone may read. */
export const MARKETPLACE_PAYLOAD = marketplacePayload(
  MARKETPLACE_CANONICAL_REF,
  [ACME_SKILL_ID]
)

/** One that needs a token, which is where the recovery flow starts. */
export const PRIVATE_MARKETPLACE_PAYLOAD = marketplacePayload(
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  [ACME_SKILL_ID]
)

/** One naming a skill its own marketplace has since retired. */
export const DRIFTED_MARKETPLACE_PAYLOAD = marketplacePayload(
  MARKETPLACE_CANONICAL_REF,
  [ACME_SKILL_ID, RETIRED_SKILL_ID]
)

/** The id a link carrying a pair the two scopes rule out is addressed by. */
export const OUT_OF_SCOPE_IMPORT_ID = "AcmeSc_4"

/**
 * A configuration minted before the scope rule existed.
 *
 * A project-scoped skill assigned to a sub-agent the payload says nothing about
 * — so that agent rests at global, where a project skill can never reach it.
 * Every payload the editor minted up to now could carry one, and the CLI's own
 * `--from` decode throws on it rather than installing quietly around it, so
 * these links are out in the world and cannot be installed.
 *
 * On the public catalogue deliberately: what this exercises is the arrival, and
 * a marketplace to seat first would only add a second thing that could fail.
 */
export const OUT_OF_SCOPE_PAYLOAD = seedPayloadSchema.parse({
  v: SEED_VERSION,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {
    "web-framework-react": {
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
    },
  },
  agents: {},
})

// A SECOND marketplace, for the browser that has saved more than one.
//
// Derived from the first by renaming rather than written out again: every id,
// category and display name carries `bigco` where the fixture carries `acme`.
// CLI-498's prefix rule is what makes a rename enough — a marketplace's ids
// carry its own name, so two catalogues share no id at all, which is both
// realistic and what makes "which one is on the grid" observable rather than a
// matter of counting.
export const BIGCO_REF = "bigco/skills"

// The same repository as `--marketplace` takes it, which is the form the slot
// holds and the switcher lists. Written out for the reason its siblings above
// are: a fixture states the wire value rather than asking the app what it would
// produce.
export const BIGCO_CANONICAL_REF = "github:bigco/skills"

// Parsed rather than cast, for the reason every fixture beside it is — a rename
// that broke the shape would otherwise be a cast's problem to hide.
export const BIGCO_CATALOG = matrixSchema.parse(
  JSON.parse(
    JSON.stringify(MARKETPLACE_CATALOG)
      .replaceAll("acme", "bigco")
      .replaceAll("Acme", "Bigco")
  )
)

// Where GitHub serves a file's own bytes. A second origin rather than a path on
// the first, and that is the point: it is a CDN with `access-control-allow-
// origin: *` and no API rate limit, so a skill's files cost none of the sixty
// requests an hour an unauthenticated caller gets. Only the tree listing does.
export const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com"

/**
 * The name the SKILL.md below would put on `window` if any of it were ever
 * EXECUTED rather than shown.
 *
 * Named here rather than written out twice, so the fixture and the assertion
 * that reads it back off the page cannot drift apart — a sentinel the spec
 * spells differently from the file is a test that can only pass.
 */
export const XSS_SENTINEL = "__agentsIncSkillContentsRan"

// One external skill, as its repository really holds it: a SKILL.md, the
// metadata beside it, and a nested `reference/` file. Three entries because the
// ruling is that "contents" is the whole DIRECTORY — a fixture of SKILL.md
// alone would let an implementation that carries one file pass.
//
// Its SKILL.md carries live markup on purpose (EDITOR-33). A skills index is
// user-generated content out of repositories nobody here controls, and markdown
// carries raw HTML perfectly legally, so a `<script>` and an inline handler in
// a SKILL.md are not an exotic case — a skill ABOUT web security would hold
// exactly these lines. The preview claims two things at once about content like
// this: that none of it runs, and that none of it is lost, because what the CLI
// writes to disk has to be what was on screen when someone decided to trust it.
// Harmless prose can prove neither half — it renders identically whether it is
// escaped, sanitised or handed to a markdown renderer.
export const EXTERNAL_SKILL = {
  repo: "obra/superpowers",
  path: "skills/brainstorming",
  files: {
    "SKILL.md":
      "---\nname: brainstorming\n---\n\nExplores user intent before implementation.\n\n" +
      "Never put a stranger's markup on a page: both\n" +
      `<script>window.${XSS_SENTINEL} = true</script> and\n` +
      `<img src=x onerror="window.${XSS_SENTINEL} = true"> run the moment one is parsed.\n`,
    "metadata.yaml": "slug: brainstorming\ndomain: shared\n",
    "reference/prompts.md": "# Prompts\n\nThe questions to ask first.\n",
  },
} as const

// A second one, so a spec can stage two and assert on the pair.
export const OTHER_EXTERNAL_SKILL = {
  repo: "addyosmani/agent-skills",
  path: "skills/code-review-and-quality",
  files: {
    "SKILL.md":
      "---\nname: code-review-and-quality\n---\n\nMulti-axis review.\n",
  },
} as const

// A repository whose skill directory is a code library wearing a SKILL.md.
// Measured from the real `anthropics/skills/skills/docx`, which is 1.1 MB and
// almost all XML schemas — the case the per-skill cap exists to refuse.
export const OVERSIZED_EXTERNAL_SKILL = {
  repo: "anthropics/skills",
  path: "skills/docx",
} as const

// A file that is not text at all. PNG's magic bytes, which are invalid UTF-8 —
// so a decoder asked to be strict refuses them rather than substituting
// replacement characters into a file the CLI would later write to disk.
export const BINARY_FILE_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe,
])

// A `catalog.json` that is JSON and is not a catalogue — the case a byte
// comparison cannot catch and a `safeParse` can. `skills` is an array where the
// contract says a record, so the failure names a path rather than being a bare
// "invalid": what the dialog shows has to say WHICH field, or an author cannot
// fix their own build.
export const MALFORMED_CATALOG = {
  version: "9.9.9-acme",
  categories: {},
  skills: [],
  suggestedStacks: [],
}
