import {
  MAX_EXTERNAL_SKILL_BYTES,
  installableSeedPayloadSchema,
} from "@workspace/matrix/seed"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { getResponse } from "msw"
import { describe, expect, it } from "vitest"

import { EXPOSE_HEADERS_HEADER, answerFor } from "./answer"
import {
  COMPOSED_PROPOSAL,
  COMPOSE_FAILED_BODY,
  COMPOSE_TOO_LONG_BODY,
  COMPOSE_TOO_MANY_BODY,
  CONFIG_WRITE_WINDOW_SECONDS,
  DEAD_LINK_ID,
  EXTERNAL_SKILL,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  MALFORMED_CATALOG,
  MARKETPLACE_CATALOG,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  NO_CONFIG_BODY,
  NO_STACK_BODY,
  OTHER_EXTERNAL_SKILL,
  OTHER_SAVED_STACK,
  OUT_OF_SCOPE_PAYLOAD,
  OVERSIZED_EXTERNAL_SKILL,
  PRIVATE_MARKETPLACE_REF,
  RATE_LIMITED_BODY,
  SAVED_STACK,
  SIGNED_IN_USER,
  SKILL_INDEX_UNAVAILABLE_BODY,
  STACK_NAME_TAKEN_BODY,
  STACK_RENAMED_AT,
  STALE_SKILL_INDEX,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_REFUSED_BODY,
  UNAUTHORIZED_BODY,
  UNREADABLE_CONFIG_BODY,
  UNREADABLE_CONFIG_ID,
  WORKER_EXPOSED_HEADERS,
} from "./fixtures"
import {
  COMPOSE_URL,
  CONFIGS_URL,
  SESSION_URL,
  SIGN_IN_URL,
  SIGN_OUT_URL,
  SKILL_INDEX_URL,
  STACKS_URL,
  TOO_MANY,
  authHandlers,
  binarySkillFileHandler,
  catalogForbiddenHandler,
  catalogHandlers,
  catalogUnauthorizedHandler,
  catalogUnreachableHandler,
  composeHandlers,
  composeRefusedHandler,
  composeRefusedHandlerFor,
  composeTooLongHandler,
  composeTooManyHandler,
  composeUnreachableHandler,
  configHandlers,
  configRateLimitedHandler,
  configRefusedHandlerFor,
  configUnreachableHandler,
  emptySkillTreeHandler,
  malformedCatalogHandler,
  missingConfigHandlerFor,
  oversizedSkillHandler,
  signInRateLimitedHandler,
  signInRefusedHandler,
  signInUnreachableHandler,
  signInWithoutRedirectHandler,
  signOutRefusedHandler,
  signOutUnreachableHandler,
  signedInHandlers,
  skillContentsHandlers,
  skillIndexUnavailableHandler,
  skillTreeUnreachableHandler,
  stackNotFoundHandler,
  stackRefusedHandler,
  stackRefusedHandlerFor,
  stackUnreachableHandler,
  staleSkillIndexHandler,
  storeRefusedHandler,
  storedConfigHandlerFor,
} from "./handlers"

import type { MockedAnswer } from "./answer"
import type { SavedStack } from "./fixtures"
import type { RequestHandler } from "msw"

const jsonOf = (answer: MockedAnswer): unknown => {
  if (!answer.served) throw new Error(`Not served: ${answer.reason}`)
  return JSON.parse(new TextDecoder().decode(answer.body))
}

const post = (payload: unknown) =>
  new Request(CONFIGS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })

/** The lossy trip a `Response` body takes, so a `ZodError` compares as it crosses the wire. */
const wireShapeOf = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value))

describe("createConfig", () => {
  it("mints an id for a payload the write contract accepts", async () => {
    const answer = await answerFor(configHandlers, post(STORED_PAYLOAD))

    expect(answer.served && answer.status).toBe(201)
    expect(jsonOf(answer)).toStrictEqual({ id: STORED_ID })
  })

  // The base schema takes this payload; only the write schema refuses it.
  it("refuses a project-scoped skill on a sub-agent resting at global, exactly as the worker does", async () => {
    const refused = installableSeedPayloadSchema.safeParse(OUT_OF_SCOPE_PAYLOAD)
    // Guards against becoming a test of nothing.
    expect(
      refused.success,
      "the fixture must still be one the write contract refuses"
    ).toBe(false)

    const answer = await answerFor(configHandlers, post(OUT_OF_SCOPE_PAYLOAD))

    expect(answer.served && answer.status).toBe(400)
    // `@hono/zod-validator`'s default hook envelope.
    expect(jsonOf(answer)).toStrictEqual(
      wireShapeOf({ success: false, error: refused.error })
    )
  })

  it("still lets an installed refusal answer ahead of validation", async () => {
    const answer = await answerFor(
      [storeRefusedHandler, ...configHandlers],
      post(OUT_OF_SCOPE_PAYLOAD)
    )

    expect(answer.served && answer.status).toBe(503)
  })

  it("still lets a parameterised refusal answer ahead of validation, for a payload the schema would accept", async () => {
    const answer = await answerFor(
      [configRefusedHandlerFor(413), ...configHandlers],
      post(STORED_PAYLOAD)
    )

    expect(answer.served && answer.status).toBe(413)
  })
})

// Resolved with `getResponse`, not `answerFor`: `@msw/playwright` fulfils handlers verbatim, so the
// exposure must come from the handler itself.
describe("a rate-limited mint", () => {
  it("answers as the worker's limiter does, with a window a browser may read", async () => {
    const response = await getResponse(
      [configRateLimitedHandler, ...configHandlers],
      post(STORED_PAYLOAD)
    )
    if (!response) throw new Error("no handler answered the mint")

    expect(response.status).toBe(TOO_MANY)
    expect(await response.text()).toBe(RATE_LIMITED_BODY)
    expect(response.headers.get("retry-after")).toBe(
      String(CONFIG_WRITE_WINDOW_SECONDS)
    )
    expect(response.headers.get(EXPOSE_HEADERS_HEADER)).toBe(
      WORKER_EXPOSED_HEADERS
    )
  })

  it("is what a refusal named by the 429 status answers", async () => {
    const response = await getResponse(
      [configRefusedHandlerFor(TOO_MANY)],
      post(STORED_PAYLOAD)
    )

    expect(response?.headers.get("retry-after")).toBe(
      String(CONFIG_WRITE_WINDOW_SECONDS)
    )
  })
})

const responseTo = async (handlers: RequestHandler[], request: Request) => {
  const response = await getResponse(handlers, request)
  if (!response) throw new Error(`no handler answered ${request.url}`)
  return response
}

const get = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers })

const sendJson = (method: string, url: string, body: unknown = {}) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

// hono's `c.text` type, which the CLI gates quoting on.
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8"

const UNREACHABLE: MockedAnswer = { served: false, reason: "unreachable" }

describe("readConfig", () => {
  it("answers an id the store never held with the worker's 404 text", async () => {
    const response = await responseTo(
      configHandlers,
      get(`${CONFIGS_URL}/${DEAD_LINK_ID}`)
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toBe(HONO_TEXT_PLAIN)
    expect(await response.text()).toBe(NO_CONFIG_BODY)
  })

  it("answers an id whose stored bytes no longer validate with the worker's 500 text", async () => {
    const response = await responseTo(
      configHandlers,
      get(`${CONFIGS_URL}/${UNREADABLE_CONFIG_ID}`)
    )

    expect(response.status).toBe(500)
    expect(response.headers.get("content-type")).toBe(HONO_TEXT_PLAIN)
    expect(await response.text()).toBe(UNREADABLE_CONFIG_BODY)
  })
})

describe("a one-off config handler", () => {
  const storedImport = storedConfigHandlerFor(
    MARKETPLACE_IMPORT_ID,
    MARKETPLACE_PAYLOAD
  )

  it("answers its own id with the payload it was given, ahead of the default set", async () => {
    const response = await responseTo(
      [storedImport, ...configHandlers],
      get(`${CONFIGS_URL}/${MARKETPLACE_IMPORT_ID}`)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(MARKETPLACE_PAYLOAD)
  })

  it("leaves every other id to the default set", async () => {
    const response = await responseTo(
      [storedImport, ...configHandlers],
      get(`${CONFIGS_URL}/${STORED_ID}`)
    )

    expect(await response.json()).toStrictEqual(STORED_PAYLOAD)
  })

  it("can take the stored id away, as a deleted link", async () => {
    const response = await responseTo(
      [missingConfigHandlerFor(STORED_ID), ...configHandlers],
      get(`${CONFIGS_URL}/${STORED_ID}`)
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toBe(HONO_TEXT_PLAIN)
    expect(await response.text()).toBe(NO_CONFIG_BODY)
  })
})

describe("a refused mint", () => {
  it("answers the store's refusal in the worker's own words", async () => {
    const response = await responseTo(
      [storeRefusedHandler],
      post(STORED_PAYLOAD)
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("content-type")).toBe(HONO_TEXT_PLAIN)
    expect(await response.text()).toBe(STORE_REFUSED_BODY)
  })

  it("drops the connection when the worker is unreachable", async () => {
    const answer = await answerFor(
      [configUnreachableHandler],
      post(STORED_PAYLOAD)
    )

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})

describe("the skill index", () => {
  it("answers last week's index with a 200, marked stale", async () => {
    const response = await responseTo(
      [staleSkillIndexHandler],
      get(SKILL_INDEX_URL)
    )

    expect(response.status).toBe(200)
    expect(response.headers.get(SKILL_INDEX_FRESHNESS_HEADER)).toBe("stale")
    expect(await response.json()).toStrictEqual(STALE_SKILL_INDEX)
  })

  it("answers 503 in the worker's words when no index was ever published", async () => {
    const response = await responseTo(
      [skillIndexUnavailableHandler],
      get(SKILL_INDEX_URL)
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("content-type")).toBe(HONO_TEXT_PLAIN)
    expect(await response.text()).toBe(SKILL_INDEX_UNAVAILABLE_BODY)
  })
})

describe("a marketplace catalogue on GitHub", () => {
  const catalogOf = (ref: string, headers: Record<string, string> = {}) =>
    get(
      `${GITHUB_API_ORIGIN}/repos/${ref}/contents/.claude-plugin/catalog.json`,
      headers
    )

  const withToken = { Authorization: `Bearer ${MARKETPLACE_TOKEN}` }

  const GITHUB_NOT_FOUND = { message: "Not Found" }

  it("serves a public marketplace's catalogue to anyone", async () => {
    const response = await responseTo(
      catalogHandlers,
      catalogOf(MARKETPLACE_REF)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(MARKETPLACE_CATALOG)
  })

  it("hides a private marketplace from a caller without its token, as GitHub does", async () => {
    const response = await responseTo(
      catalogHandlers,
      catalogOf(PRIVATE_MARKETPLACE_REF)
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toStrictEqual(GITHUB_NOT_FOUND)
  })

  it("serves a private marketplace once its token arrives", async () => {
    const response = await responseTo(
      catalogHandlers,
      catalogOf(PRIVATE_MARKETPLACE_REF, withToken)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(MARKETPLACE_CATALOG)
  })

  it("answers a repository it does not know with GitHub's 404, token or not", async () => {
    const response = await responseTo(
      catalogHandlers,
      catalogOf("acme/nothing-here", withToken)
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toStrictEqual(GITHUB_NOT_FOUND)
  })

  it("can answer with JSON that is not a catalogue", async () => {
    const response = await responseTo(
      [malformedCatalogHandler],
      catalogOf(MARKETPLACE_REF)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(MALFORMED_CATALOG)
  })

  it("can refuse a token that is no longer good, in GitHub's words", async () => {
    const response = await responseTo(
      [catalogUnauthorizedHandler],
      catalogOf(PRIVATE_MARKETPLACE_REF, withToken)
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({ message: "Bad credentials" })
  })

  it("can refuse an anonymous caller past GitHub's rate limit, in GitHub's words", async () => {
    const response = await responseTo(
      [catalogForbiddenHandler],
      catalogOf(MARKETPLACE_REF)
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toStrictEqual({
      message: "API rate limit exceeded",
    })
  })

  it("can drop the connection", async () => {
    const answer = await answerFor(
      [catalogUnreachableHandler],
      catalogOf(MARKETPLACE_REF)
    )

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})

describe("an external skill's files on GitHub", () => {
  const treeOf = (repo: string) =>
    get(`${GITHUB_API_ORIGIN}/repos/${repo}/git/trees/HEAD?recursive=1`)

  const rawFileOf = (repo: string, fullPath: string) =>
    get(`${GITHUB_RAW_ORIGIN}/${repo}/HEAD/${fullPath}`)

  // `sha` is left out: GitHub's is a content hash, the mock's a stand-in nothing reads.
  const fileEntry = (path: string, text: string) => ({
    path,
    mode: "100644",
    type: "blob",
    size: new TextEncoder().encode(text).byteLength,
  })

  const DECOY = { path: "README.md", mode: "100644", type: "blob" }

  it("lists a skill's whole directory, beside a file outside it", async () => {
    const response = await responseTo(
      skillContentsHandlers,
      treeOf(EXTERNAL_SKILL.repo)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      truncated: false,
      tree: [
        DECOY,
        fileEntry(
          "skills/brainstorming/SKILL.md",
          EXTERNAL_SKILL.files["SKILL.md"]
        ),
        fileEntry(
          "skills/brainstorming/metadata.yaml",
          EXTERNAL_SKILL.files["metadata.yaml"]
        ),
        fileEntry(
          "skills/brainstorming/reference/prompts.md",
          EXTERNAL_SKILL.files["reference/prompts.md"]
        ),
      ],
    })
  })

  it("answers a repository it serves no skill from with GitHub's 404", async () => {
    const response = await responseTo(
      skillContentsHandlers,
      treeOf("acme/nothing-here")
    )

    expect(response.status).toBe(404)
  })

  it("serves each file of a skill it lists, a nested one included", async () => {
    const nested = await responseTo(
      skillContentsHandlers,
      rawFileOf(
        EXTERNAL_SKILL.repo,
        `${EXTERNAL_SKILL.path}/reference/prompts.md`
      )
    )
    const otherSkill = await responseTo(
      skillContentsHandlers,
      rawFileOf(
        OTHER_EXTERNAL_SKILL.repo,
        `${OTHER_EXTERNAL_SKILL.path}/SKILL.md`
      )
    )

    expect(await nested.text()).toBe(
      EXTERNAL_SKILL.files["reference/prompts.md"]
    )
    expect(await otherSkill.text()).toBe(OTHER_EXTERNAL_SKILL.files["SKILL.md"])
  })

  it("answers a file the skill does not hold with the raw CDN's 404", async () => {
    const response = await responseTo(
      skillContentsHandlers,
      rawFileOf(EXTERNAL_SKILL.repo, `${EXTERNAL_SKILL.path}/missing.md`)
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("404: Not Found")
  })

  it("can list one file a byte past the per-skill cap", async () => {
    const response = await responseTo(
      [oversizedSkillHandler],
      treeOf(OVERSIZED_EXTERNAL_SKILL.repo)
    )

    expect(await response.json()).toMatchObject({
      truncated: false,
      tree: [
        {
          path: `${OVERSIZED_EXTERNAL_SKILL.path}/SKILL.md`,
          mode: "100644",
          type: "blob",
          size: MAX_EXTERNAL_SKILL_BYTES + 1,
        },
      ],
    })
  })

  it("can list a repository that holds no such directory", async () => {
    const response = await responseTo(
      [emptySkillTreeHandler],
      treeOf(EXTERNAL_SKILL.repo)
    )

    expect(await response.json()).toMatchObject({
      truncated: false,
      tree: [DECOY],
    })
  })

  it("serves a file that is not text as bytes", async () => {
    const response = await responseTo(
      [binarySkillFileHandler],
      rawFileOf(EXTERNAL_SKILL.repo, `${EXTERNAL_SKILL.path}/logo.png`)
    )

    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream"
    )
  })

  it("can drop the connection while listing", async () => {
    const answer = await answerFor(
      [skillTreeUnreachableHandler],
      treeOf(EXTERNAL_SKILL.repo)
    )

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})

describe("Better Auth's guards on a POST", () => {
  it("refuses a body without a JSON content type in Better Auth's words", async () => {
    const response = await responseTo(
      authHandlers,
      new Request(SIGN_OUT_URL, { method: "POST", body: "{}" })
    )

    expect(response.status).toBe(415)
    expect(await response.json()).toStrictEqual({
      message: "Content-Type is required. Allowed types: application/json",
      code: "UNSUPPORTED_MEDIA_TYPE",
    })
  })

  it("refuses a JSON request with no parseable body in Better Auth's words", async () => {
    const response = await responseTo(
      authHandlers,
      new Request(SIGN_OUT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toStrictEqual({
      message: "Invalid JSON in request body",
      code: "BAD_REQUEST",
    })
  })
})

describe("a failed sign-in or sign-out", () => {
  it.each([
    [
      "the auth limiter refusing a sign-in",
      signInRateLimitedHandler,
      SIGN_IN_URL,
      429,
    ],
    [
      "the worker declining to start the flow",
      signInRefusedHandler,
      SIGN_IN_URL,
      500,
    ],
    ["the worker failing a sign-out", signOutRefusedHandler, SIGN_OUT_URL, 500],
  ])(
    "answers %s with its status and no body",
    async (_, handler, url, status) => {
      const response = await responseTo([handler], sendJson("POST", url))

      expect(response.status).toBe(status)
      expect(await response.text()).toBe("")
    }
  )

  it("can start a sign-in that sends the browser nowhere", async () => {
    const response = await responseTo(
      [signInWithoutRedirectHandler],
      sendJson("POST", SIGN_IN_URL)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({})
  })

  it.each([
    ["sign-in", signInUnreachableHandler, SIGN_IN_URL],
    ["sign-out", signOutUnreachableHandler, SIGN_OUT_URL],
  ])("can drop the connection on a %s", async (_, handler, url) => {
    const answer = await answerFor([handler], sendJson("POST", url))

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})

describe("a signed-in browser", () => {
  it("reads a session naming its user", async () => {
    const response = await responseTo(signedInHandlers, get(SESSION_URL))

    expect(await response.json()).toStrictEqual({ user: SIGNED_IN_USER })
  })

  it("saves a stack, echoing its name and config with a minted id and timestamps", async () => {
    const response = await responseTo(
      signedInHandlers,
      sendJson("POST", STACKS_URL, {
        name: "Side project",
        configId: STORED_ID,
      })
    )
    const minted: Record<keyof SavedStack, unknown> = {
      id: expect.any(String),
      name: "Side project",
      configId: STORED_ID,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    }

    expect(response.status).toBe(201)
    expect(await response.json()).toStrictEqual(minted)
  })

  it("renames a stack in place, changing only its name and when it was updated", async () => {
    const response = await responseTo(
      signedInHandlers,
      sendJson("PATCH", `${STACKS_URL}/${SAVED_STACK.id}`, { name: "Renamed" })
    )

    expect(await response.json()).toStrictEqual({
      ...SAVED_STACK,
      name: "Renamed",
      updatedAt: STACK_RENAMED_AT,
    })
  })

  // As the worker does: trimmed, in any case, as the editor's `sameName` compares.
  it("is refused a save under a name its stacks already hold, in any case", async () => {
    const response = await responseTo(
      signedInHandlers,
      sendJson("POST", STACKS_URL, {
        name: `  ${SAVED_STACK.name.toUpperCase()}  `,
        configId: STORED_ID,
      })
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
  })

  it("is refused a rename onto the name another of its stacks holds", async () => {
    const response = await responseTo(
      signedInHandlers,
      sendJson("PATCH", `${STACKS_URL}/${SAVED_STACK.id}`, {
        name: OTHER_SAVED_STACK.name.toLowerCase(),
      })
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
  })

  // A stack's own name is not another stack's.
  it("renames a stack to its own name in another case", async () => {
    const name = SAVED_STACK.name.toUpperCase()

    const response = await responseTo(
      signedInHandlers,
      sendJson("PATCH", `${STACKS_URL}/${SAVED_STACK.id}`, { name })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({
      ...SAVED_STACK,
      name,
      updatedAt: STACK_RENAMED_AT,
    })
  })

  it("deletes a stack with a 204 and no body", async () => {
    const response = await responseTo(
      signedInHandlers,
      new Request(`${STACKS_URL}/${SAVED_STACK.id}`, { method: "DELETE" })
    )

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })

  it("is answered a composed proposal", async () => {
    const response = await responseTo(
      signedInHandlers,
      sendJson("POST", COMPOSE_URL, { sentence: "a React app" })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(COMPOSED_PROPOSAL)
  })

  it("is told another person's stack is no stack at all", async () => {
    const response = await responseTo(
      [stackNotFoundHandler, ...signedInHandlers],
      sendJson("PATCH", `${STACKS_URL}/${SAVED_STACK.id}`, { name: "Renamed" })
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toStrictEqual(NO_STACK_BODY)
  })
})

describe("a cookieless browser", () => {
  it("is refused a compose", async () => {
    const response = await responseTo(
      composeHandlers,
      sendJson("POST", COMPOSE_URL, { sentence: "a React app" })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual(UNAUTHORIZED_BODY)
  })
})

describe("a refused stack save", () => {
  it("answers 401 with the worker's unauthorized body", async () => {
    const response = await responseTo(
      [stackRefusedHandlerFor(401)],
      sendJson("POST", STACKS_URL)
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual(UNAUTHORIZED_BODY)
  })

  it("answers 409 with the worker's name-taken body", async () => {
    const response = await responseTo(
      [stackRefusedHandlerFor(409)],
      sendJson("POST", STACKS_URL)
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
  })

  it("answers any other status with no body", async () => {
    const response = await responseTo(
      [stackRefusedHandler],
      sendJson("POST", STACKS_URL)
    )

    expect(response.status).toBe(500)
    expect(await response.text()).toBe("")
  })

  it("can drop the connection", async () => {
    const answer = await answerFor(
      [stackUnreachableHandler],
      sendJson("POST", STACKS_URL)
    )

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})

describe("a refused compose", () => {
  const compose = () =>
    sendJson("POST", COMPOSE_URL, { sentence: "a React app" })

  it("answers the limiter's 429 with its declared body", async () => {
    const response = await responseTo([composeTooManyHandler], compose())

    expect(response.status).toBe(429)
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_MANY_BODY)
  })

  it("answers a silent model's 502 with its declared body", async () => {
    const response = await responseTo([composeRefusedHandler], compose())

    expect(response.status).toBe(502)
    expect(await response.json()).toStrictEqual(COMPOSE_FAILED_BODY)
  })

  it("answers a sentence past the limit with a 400 that says so", async () => {
    const response = await responseTo([composeTooLongHandler], compose())

    expect(response.status).toBe(400)
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_LONG_BODY)
  })

  it("answers any other status with no body", async () => {
    const response = await responseTo(
      [composeRefusedHandlerFor(400)],
      compose()
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe("")
  })

  it("can drop the connection", async () => {
    const answer = await answerFor([composeUnreachableHandler], compose())

    expect(answer).toStrictEqual(UNREACHABLE)
  })
})
