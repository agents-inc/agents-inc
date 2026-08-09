import { seedPayloadSchema } from "@workspace/matrix/seed"
import { skillIndexSchema } from "@workspace/matrix/skill-index"

// What the worker (apps/server) answers with, and nothing about how a caller
// intercepts it. This module names no mocking library on purpose: the
// Playwright suite keeps its own `page.route` interception and wants only these
// values, so importing them must not drag msw into its runner.

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
export const STORED_PAYLOAD = seedPayloadSchema.parse({
  v: 3,
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
    "web-developer": { model: "haiku", effort: "max" },
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
// the sixty-odd the real repositories hold.
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
    },
    {
      name: "docx",
      description:
        "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents.",
      repo: "anthropics/skills",
      path: "skills/docx",
      stars: 166923,
    },
    {
      name: "code-review-and-quality",
      description:
        "Conducts multi-axis code review. Use before merging any change.",
      repo: "addyosmani/agent-skills",
      path: "skills/code-review-and-quality",
      stars: 84036,
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
