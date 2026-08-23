import { matrixSchema } from "@workspace/matrix/matrix-schema"
import { seedPayloadSchema } from "@workspace/matrix/seed"
import { skillIndexSchema } from "@workspace/matrix/skill-index"

// What the worker (apps/server) answers with, and nothing about how a caller
// intercepts it. This module names no mocking library on purpose: the
// Playwright suite keeps its own `page.route` interception and wants only these
// values, so importing them must not drag msw into its runner.
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
export const STORED_PAYLOAD = seedPayloadSchema.parse({
  v: 5,
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
})

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
