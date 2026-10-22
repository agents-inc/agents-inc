// The shipped catalogue's fences, as the shared validator answers them. `MATRIX` rather than a built
// catalogue: the subject is which rules the shipped relationships declare, and a built catalogue
// carries only the rules somebody wrote into it.

import { MATRIX } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { validateSelection } from "./selection"
import type { SelectionValidation, SkillId } from "./types"

const validate = (selection: SkillId[]): SelectionValidation =>
  validateSelection(selection, MATRIX)

const nothingWrong = (): SelectionValidation => ({ valid: true, errors: [] })

const onlyUnmet = (
  message: string,
  skills: SkillId[]
): SelectionValidation => ({
  valid: false,
  errors: [{ type: "missingRequirement", message, skills }],
})

const REACT = "web-framework-react"
const REACT_NATIVE = "mobile-framework-react-native"
const EXPO = "mobile-framework-expo"
const NEXTJS = "web-meta-framework-nextjs"

describe("mobile and desktop framework fences", () => {
  const NATIVEWIND = "mobile-styling-nativewind"
  const DETOX = "mobile-testing-detox"
  const MAESTRO = "mobile-testing-maestro"
  const TAURI = "desktop-framework-tauri"
  const TAURI_MOBILE = "desktop-mobile-tauri"
  const ELECTRON = "desktop-framework-electron"
  const ELECTRON_IPC = "desktop-ipc-electron"

  it("fences a mobile skill to the two mobile frameworks, naming both", () => {
    expect(validate([NATIVEWIND])).toStrictEqual(
      onlyUnmet("NativeWind requires one of: React Native, Expo", [
        NATIVEWIND,
        REACT_NATIVE,
        EXPO,
      ])
    )
  })

  // React rides along because React Native is built on it.
  it("clears the mobile fence once a mobile framework joins the selection", () => {
    expect(validate([NATIVEWIND, REACT_NATIVE, REACT])).toStrictEqual(
      nothingWrong()
    )
  })

  it("counts Tauri's mobile target on its own as an app for Maestro to drive", () => {
    expect(validate([MAESTRO])).toStrictEqual(
      onlyUnmet("Maestro requires one of: React Native, Expo, Tauri Mobile", [
        MAESTRO,
        REACT_NATIVE,
        EXPO,
        TAURI_MOBILE,
      ])
    )
    expect(validate([MAESTRO, TAURI_MOBILE, TAURI])).toStrictEqual(
      nothingWrong()
    )
  })

  it("fences a desktop skill to the framework whose APIs it teaches", () => {
    expect(validate([ELECTRON_IPC])).toStrictEqual(
      onlyUnmet("Electron Type-Safe IPC requires: Electron", [
        ELECTRON_IPC,
        ELECTRON,
      ])
    )
    expect(validate([ELECTRON_IPC, ELECTRON])).toStrictEqual(nothingWrong())
  })

  it("lets the two mobile E2E runners be selected together, since they layer", () => {
    expect(validate([DETOX, MAESTRO, REACT_NATIVE, REACT])).toStrictEqual(
      nothingWrong()
    )
  })
})

describe("api and cross-cutting skill fences", () => {
  const MERCURIUS = "api-graphql-mercurius"
  const FASTIFY = "api-framework-fastify"
  const HONO = "api-framework-hono"
  const NEXTAUTH = "api-auth-nextauth"
  const BULLMQ = "api-queue-bullmq"
  const REDIS = "api-database-redis"
  const UPSTASH = "api-database-upstash"
  const VERCEL_KV = "api-database-vercel-kv"
  const BETTER_AUTH = "api-auth-better-auth-drizzle-hono"
  const DRIZZLE = "api-database-drizzle"
  const COMPOSABLE_COMPONENTS = "meta-design-composable-components"
  const WEB_REVIEWING = "meta-reviewing-web-reviewing"

  it("fences Mercurius to Fastify, the server it registers as a plugin on", () => {
    const fastifyMissing = onlyUnmet("Mercurius requires: Fastify", [
      MERCURIUS,
      FASTIFY,
    ])

    expect(validate([MERCURIUS])).toStrictEqual(fastifyMissing)
    expect(validate([MERCURIUS, HONO])).toStrictEqual(fastifyMissing)
    expect(validate([MERCURIUS, FASTIFY])).toStrictEqual(nothingWrong())
  })

  it("fences Auth.js to the Next.js surface the skill teaches", () => {
    expect(validate([NEXTAUTH])).toStrictEqual(
      onlyUnmet("Auth.js requires: Next.js", [NEXTAUTH, NEXTJS])
    )
    expect(validate([NEXTAUTH, NEXTJS, REACT])).toStrictEqual(nothingWrong())
  })

  it("accepts either Redis-compatible server for BullMQ, and Vercel KV is neither", () => {
    const serverMissing = onlyUnmet("BullMQ requires one of: Redis, Upstash", [
      BULLMQ,
      REDIS,
      UPSTASH,
    ])

    expect(validate([BULLMQ])).toStrictEqual(serverMissing)
    expect(validate([BULLMQ, UPSTASH])).toStrictEqual(nothingWrong())
    expect(validate([BULLMQ, REDIS])).toStrictEqual(nothingWrong())
    expect(validate([BULLMQ, VERCEL_KV])).toStrictEqual(serverMissing)
  })

  it("requires both halves of what the Better Auth skill teaches, not either one", () => {
    expect(validate([BETTER_AUTH])).toStrictEqual(
      onlyUnmet("Better Auth requires: Drizzle, Hono", [
        BETTER_AUTH,
        DRIZZLE,
        HONO,
      ])
    )
    expect(validate([BETTER_AUTH, DRIZZLE])).toStrictEqual(
      onlyUnmet("Better Auth requires: Hono", [BETTER_AUTH, HONO])
    )
    expect(validate([BETTER_AUTH, HONO])).toStrictEqual(
      onlyUnmet("Better Auth requires: Drizzle", [BETTER_AUTH, DRIZZLE])
    )
    expect(validate([BETTER_AUTH, DRIZZLE, HONO])).toStrictEqual(nothingWrong())
  })

  it("binds the two React-surfaced cross-cutting skills to React", () => {
    expect(validate([COMPOSABLE_COMPONENTS])).toStrictEqual(
      onlyUnmet("Composable Components requires: React", [
        COMPOSABLE_COMPONENTS,
        REACT,
      ])
    )
    expect(validate([COMPOSABLE_COMPONENTS, REACT])).toStrictEqual(
      nothingWrong()
    )

    expect(validate([WEB_REVIEWING])).toStrictEqual(
      onlyUnmet("Web Reviewing requires: React", [WEB_REVIEWING, REACT])
    )
    expect(validate([WEB_REVIEWING, REACT])).toStrictEqual(nothingWrong())
  })
})

// A pair is also a declared conflict, whose reason is a catalogue author's prose; the types pin
// that it is reported without pinning the words.
describe("the pick-one categories the catalogue split or merged", () => {
  const ELYSIA = "api-framework-elysia"
  const HONO = "api-framework-hono"
  const TURBOREPO = "shared-monorepo-turborepo"
  const NX = "shared-monorepo-nx"
  const PNPM_WORKSPACES = "shared-monorepo-pnpm-workspaces"
  const BIOME = "shared-tooling-biome"
  const ESLINT_PRETTIER = "shared-tooling-eslint-prettier"
  const STACK_DETECT = "meta-config-stack-detect"
  const CHANGESETS = "shared-tooling-changesets"
  const GIT_HOOKS = "shared-tooling-git-hooks"
  const TYPESCRIPT_CONFIG = "shared-tooling-typescript-config"

  it("holds Elysia in the one pick-one category with the frameworks it competes with", () => {
    const { errors } = validate([ELYSIA, HONO])

    expect(errors.map((error) => error.type)).toStrictEqual([
      "conflict",
      "categoryExclusive",
    ])
    expect(
      errors.filter((error) => error.type === "categoryExclusive")
    ).toStrictEqual([
      {
        type: "categoryExclusive",
        message:
          'Category "API Framework" only allows one selection, but multiple selected: Elysia, Hono',
        skills: [ELYSIA, HONO],
      },
    ])
  })

  it("reports either co-selected task runner or lint pair as a pick-one category", () => {
    const taskRunners = validate([TURBOREPO, NX]).errors
    const linters = validate([BIOME, ESLINT_PRETTIER]).errors

    expect(taskRunners.map((error) => error.type)).toStrictEqual([
      "conflict",
      "categoryExclusive",
    ])
    expect(
      taskRunners.filter((error) => error.type === "categoryExclusive")
    ).toStrictEqual([
      {
        type: "categoryExclusive",
        message:
          'Category "Task Runner" only allows one selection, but multiple selected: Turborepo, Nx',
        skills: [TURBOREPO, NX],
      },
    ])

    expect(linters.map((error) => error.type)).toStrictEqual([
      "conflict",
      "categoryExclusive",
    ])
    expect(
      linters.filter((error) => error.type === "categoryExclusive")
    ).toStrictEqual([
      {
        type: "categoryExclusive",
        message:
          'Category "Lint & Format" only allows one selection, but multiple selected: Biome, ESLint & Prettier',
        skills: [BIOME, ESLINT_PRETTIER],
      },
    ])
  })

  it("keeps pnpm workspaces composable with either task runner", () => {
    expect(validate([PNPM_WORKSPACES, TURBOREPO])).toStrictEqual(nothingWrong())
    expect(validate([PNPM_WORKSPACES, NX])).toStrictEqual(nothingWrong())
  })

  it("keeps the rest of the tooling composable with either lint tool", () => {
    const restOfTooling: SkillId[] = [
      STACK_DETECT,
      CHANGESETS,
      GIT_HOOKS,
      TYPESCRIPT_CONFIG,
    ]

    expect(validate([BIOME, ...restOfTooling])).toStrictEqual(nothingWrong())
    expect(validate([ESLINT_PRETTIER, ...restOfTooling])).toStrictEqual(
      nothingWrong()
    )
  })
})
