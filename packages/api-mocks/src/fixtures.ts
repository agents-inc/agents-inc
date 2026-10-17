import { CATALOG } from "@workspace/matrix"
import { matrixSchema } from "@workspace/matrix/matrix-schema"
import { SEED_VERSION, seedPayloadSchema } from "@workspace/matrix/seed"
import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexSchema,
} from "@workspace/matrix/skill-index"

import type { SeedPayload } from "@workspace/matrix/seed"

// What the worker answers with, as plain values: no mocking library is imported here. GitHub is
// the one other origin, because marketplace catalogues are fetched browser-direct.

// The editor's default `VITE_API_URL`.
export const WORKER_ORIGIN = "http://localhost:8787"

// The worker's id is an 8-character truncated content hash.
export const STORED_ID = "Ab3xY9_Q"

export const DEAD_LINK_ID = "gone0000"

// Unreachable in production (the key is the payload's hash); the worker answers 500.
export const UNREADABLE_CONFIG_ID = "corrupt0"

// The worker's own bodies, mirrored.
export const NO_CONFIG_BODY = "No config under this id"
export const UNREADABLE_CONFIG_BODY = "Stored config is unreadable"
export const STORE_REFUSED_BODY = "Could not store this config"
export const RATE_LIMITED_BODY = "Too many requests"

// The limiter binding's whole `period`: it never says when a window ends.
export const CONFIG_WRITE_WINDOW_SECONDS = 60

// The worker's `cors()` `exposeHeaders`, joined as hono joins it.
export const WORKER_EXPOSED_HEADERS = [
  SKILL_INDEX_FRESHNESS_HEADER,
  "retry-after",
].join(",")

// Real catalog ids, since the app prunes unknown ones. Parsed so a drifting fixture fails at
// import. `web-developer` is pinned to the project because a project skill never reaches a
// globally written sub-agent, and `init --from` throws without it.
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

export const STORED_PAYLOAD = seedPayload()

// Every entry is a real skill in an allowlisted repo. `bytes` are real, so `docx` is past
// `MAX_EXTERNAL_SKILL_BYTES` and the rest are inside it.
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
// The one entry that can never be added.
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
// Addable by weight, from a repo the content stub does not serve, to reach the late refusal.
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

// Only `builtAt` and the freshness header mark it stale.
export const STALE_SKILL_INDEX = skillIndexSchema.parse({
  ...SKILL_INDEX,
  builtAt: "2026-08-01T09:00:00.000Z",
})

// Nothing cached and an upstream that will not answer.
export const SKILL_INDEX_UNAVAILABLE_BODY =
  "The skill index is not available yet"

// Only the fields the editor's `sessionSchema` reads.
export const SIGNED_IN_USER = {
  id: "u_1",
  name: "Vincent",
  email: "v@example.com",
} as const

export const SIGNED_IN_SESSION = { user: SIGNED_IN_USER }

// A 200 carrying `null`, not a 401: signed out is an ordinary state.
export const NO_SESSION = null

// The body `authenticated` sends on every 401, whatever the route's OpenAPI declares.
export const UNAUTHORIZED_BODY = { error: "unauthorized" } as const

// Where sign-in sends the browser; Better Auth mints `state`, so the query is only a shape.
export const GITHUB_AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize?client_id=Iv1.0123456789abcdef&state=t9Yb2Qw4&scope=user%3Aemail"

// Two instants: `updatedAt` is the sort key and what a rename changes.
export const STACK_SAVED_AT = "2026-08-28T00:00:00.000Z"
export const STACK_RENAMED_AT = "2026-08-29T00:00:00.000Z"

/**
 * A saved stack is a name and a pointer into `/configs`. The id is derived from the name where the
 * worker uses `crypto.randomUUID()`; nothing reads its form.
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

// Newest-first on `updatedAt`, as `GET /stacks` returns them; both point at the served config.
export const SAVED_STACK = savedStack("Weekend project")
export const OTHER_SAVED_STACK = savedStack(
  "Client work",
  STORED_ID,
  "2026-08-27T00:00:00.000Z"
)
export const SAVED_STACKS = [SAVED_STACK, OTHER_SAVED_STACK]

// The worker answers 404 for another person's id and for none alike.
export const MISSING_STACK_ID = "s_not-yours"

export const NO_STACK_BODY = { error: "not found" } as const

// Ids are checked against the catalogue at import, as the worker filters the model's answer.
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

// `/compose` tells its two 400s apart by body, so `composeProposal` reads it for that status.
export const COMPOSE_TOO_MANY_BODY = { error: "too many requests" } as const
export const COMPOSE_FAILED_BODY = {
  error: "the model did not answer",
} as const
export const COMPOSE_TOO_LONG_BODY = { error: "too long" } as const

export const GITHUB_API_ORIGIN = "https://api.github.com"

export const MARKETPLACE_REF = "acme/skills"

// GitHub 404s a private repo for an unauthorized caller, so a 404 offers the token.
export const PRIVATE_MARKETPLACE_REF = "acme/private-skills"

// The canonical forms, written out rather than derived. A bare `owner/repo` would route as a local
// directory.
export const MARKETPLACE_CANONICAL_REF = "github:acme/skills"
export const PRIVATE_MARKETPLACE_CANONICAL_REF = "github:acme/private-skills"

// A real PAT shape, since the header is built from what the user pasted.
export const MARKETPLACE_TOKEN = "ghp_000000000000000000000000000000000000"

// A `catalog.json` as `build marketplace` emits it. Prefixed ids never collide with the public
// catalogue.
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

// The catalogue above has skills, so the first key exists.
const [ACME_SKILL_ID] = Object.keys(MARKETPLACE_CATALOG.skills) as [string]

export { ACME_SKILL_ID }

/** An id no catalogue carries — the drift a payload has to survive out loud. */
export const RETIRED_SKILL_ID = "acme-web-retired"

export const MARKETPLACE_IMPORT_ID = "AcmeMk_1"
export const PRIVATE_IMPORT_ID = "AcmePv_2"
export const DRIFTED_IMPORT_ID = "AcmeDr_3"

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

// The canonical ref, never the bare one: a bare `acme/skills` routes as a local directory, and
// `seedPayloadSchema` cannot tell the forms apart.

/** A marketplace anyone may read. */
export const MARKETPLACE_PAYLOAD = marketplacePayload(
  MARKETPLACE_CANONICAL_REF,
  [ACME_SKILL_ID]
)

/** One that needs a token. */
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
 * A project-scoped skill assigned to an agent the payload leaves at global, which `--from` refuses.
 * Older editor links carry this shape.
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

// A second marketplace, derived by renaming `acme` to `bigco`; prefixed ids keep them disjoint.
export const BIGCO_REF = "bigco/skills"

export const BIGCO_CANONICAL_REF = "github:bigco/skills"

export const BIGCO_CATALOG = matrixSchema.parse(
  JSON.parse(
    JSON.stringify(MARKETPLACE_CATALOG)
      .replaceAll("acme", "bigco")
      .replaceAll("Acme", "Bigco")
  )
)

// GitHub's raw CDN: CORS-open and not rate-limited, unlike the API origin.
export const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com"

/** Set on `window` if the SKILL.md below were ever executed rather than shown. */
export const XSS_SENTINEL = "__agentsIncSkillContentsRan"

// A whole directory (SKILL.md, metadata, a nested file), since "contents" is the directory. Its
// SKILL.md carries live markup on purpose: the preview must neither run nor lose it.
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

// Modelled on `anthropics/skills/skills/docx`, past the per-skill cap.
export const OVERSIZED_EXTERNAL_SKILL = {
  repo: "anthropics/skills",
  path: "skills/docx",
} as const

// PNG magic bytes, invalid UTF-8, so a strict decoder refuses them.
export const BINARY_FILE_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe,
])

// JSON that is not a catalogue: `skills` is an array, so the failure names a path.
export const MALFORMED_CATALOG = {
  version: "9.9.9-acme",
  categories: {},
  skills: [],
  suggestedStacks: [],
}
