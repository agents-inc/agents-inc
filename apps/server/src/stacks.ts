import { createRoute, z } from "@hono/zod-openapi"
import { sameStackName } from "@workspace/matrix"
import { and, eq, ne, notExists, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { alias } from "drizzle-orm/sqlite-core"

import { UNAUTHORIZED, authenticated } from "./auth"
import { savedStacks } from "./db/app.schema"

import type { RouteHandler } from "@hono/zod-openapi"
import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

// `configId` points into KV; the payload is fetched via `GET /configs/:id`.
const savedStackSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    configId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("SavedStack")

// Half of a surrogate pair: no character, and the store hands it back as other
// text than was sent. `isWellFormed` is past this package's ES2023 lib.
const HALF_A_SURROGATE_PAIR = /\p{Cs}/u

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((name) => !HALF_A_SURROGATE_PAIR.test(name), {
    message: "Holds half of a surrogate pair",
  })

const NAME_TAKEN_BODY = { error: "name taken" as const }

// Owner ruling, 2026-10-24: refused from any caller, not only the editor.
const NAME_TAKEN = {
  409: {
    content: {
      "application/json": {
        schema: z.object({ error: z.literal(NAME_TAKEN_BODY.error) }),
      },
    },
    description:
      "Another of this person's stacks holds the name, trimmed and in any case",
  },
}

const dbOf = (c: Context<WorkerEnv>) => drizzle(c.env.DATABASE)

type Db = ReturnType<typeof dbOf>

export const listStacksRoute = createRoute({
  method: "get",
  path: "/stacks",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(savedStackSchema) } },
      description: "This person's saved stacks, newest first",
    },
    ...UNAUTHORIZED,
  },
})

export const createStackRoute = createRoute({
  method: "post",
  path: "/stacks",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ name: nameSchema, configId: z.string() }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: savedStackSchema } },
      description: "Saved",
    },
    ...NAME_TAKEN,
    ...UNAUTHORIZED,
  },
})

export const renameStackRoute = createRoute({
  method: "patch",
  path: "/stacks/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": { schema: z.object({ name: nameSchema }) },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: savedStackSchema } },
      description: "Renamed",
    },
    404: {
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
      description: "No such stack belonging to this person",
    },
    ...NAME_TAKEN,
    ...UNAUTHORIZED,
  },
})

export const deleteStackRoute = createRoute({
  method: "delete",
  path: "/stacks/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "Deleted" },
    ...UNAUTHORIZED,
  },
})

// The owner is the caller, so the column is dropped from the wire.
const withoutOwner = ({
  userId: _userId,
  ...stack
}: typeof savedStacks.$inferSelect) => stack

// Scoping the mutation itself makes another person's id un-actionable.
const ownedStack = (id: string, userId: string) =>
  and(eq(savedStacks.id, id), eq(savedStacks.userId, userId))

// `nameBytes` is the name's bytes as the store holds them, in hex: a name
// saved before half a surrogate pair was refused reads back as other text.
type HeldStack = { id: string; name: string; nameBytes: string }

const stacksHeldBy = (db: Db, userId: string): Promise<HeldStack[]> =>
  db
    .select({
      id: savedStacks.id,
      name: savedStacks.name,
      nameBytes: sql<string>`hex(${savedStacks.name})`,
    })
    .from(savedStacks)
    .where(eq(savedStacks.userId, userId))

// SQLite's `lower()` folds ASCII only, so names are compared here, not in SQL.
const holdsName = (stacks: readonly HeldStack[], name: string) =>
  stacks.some((stack) => sameStackName(stack.name, name))

const other = alias(savedStacks, "other")

// One bound parameter, whatever the account's size.
const isNoneOf = (comparedBytes: readonly string[]) =>
  sql`hex(${other.name}) not in (select value from json_each(${JSON.stringify(comparedBytes)}))`

// A write's condition, checked inside the write's own statement so nothing
// lands between the check and the write: the account holds no name (the
// renamed stack's own aside) that this request did not compare against.
// Matched by stored bytes, so a name read back as other text still matches.
const noNewNameSince = (
  db: Db,
  userId: string,
  compared: readonly HeldStack[],
  renamedId?: string
) =>
  notExists(
    db
      .select({ id: other.id })
      .from(other)
      .where(
        and(
          eq(other.userId, userId),
          renamedId === undefined ? undefined : ne(other.id, renamedId),
          isNoneOf(compared.map((stack) => stack.nameBytes))
        )
      )
  )

type NewStack = Omit<typeof savedStacks.$inferInsert, "userId">

// `insert … select` takes its values by position, in the table's column order.
const insertUnlessNewName = async (
  db: Db,
  userId: string,
  stack: NewStack,
  compared: readonly HeldStack[]
) => {
  const inserted = await db
    .insert(savedStacks)
    .select(
      sql`select ${stack.id}, ${userId}, ${stack.name}, ${stack.configId}, ${stack.createdAt}, ${stack.updatedAt} where ${noNewNameSince(db, userId, compared)}`
    )
    .returning({ id: savedStacks.id })

  return inserted.length > 0
}

const renameUnlessNewName = async (
  db: Db,
  userId: string,
  id: string,
  name: string,
  compared: readonly HeldStack[]
) => {
  const [renamed] = await db
    .update(savedStacks)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(
      and(ownedStack(id, userId), noNewNameSince(db, userId, compared, id))
    )
    .returning()

  return renamed
}

const RACED = Symbol("raced")

// A write whose condition failed lost to another write of the account's own,
// and is tried again from a fresh read. The condition compares stored bytes,
// which a fresh read always matches, so each loss means another write landed
// and only an account racing itself this hard runs out.
const MAX_ATTEMPTS = 5

const retryLostRaces = async <T>(
  attempt: () => Promise<T | typeof RACED>,
  attemptsLeft = MAX_ATTEMPTS
): Promise<T> => {
  const outcome = await attempt()
  if (outcome !== RACED) return outcome
  if (attemptsLeft <= 1) {
    throw new Error(
      `Still racing this account's writes after ${String(MAX_ATTEMPTS)} attempts`
    )
  }

  return retryLostRaces(attempt, attemptsLeft - 1)
}

type Save = { outcome: "saved" } | { outcome: "taken" }

const saveUnlessHeld = async (
  db: Db,
  userId: string,
  stack: NewStack
): Promise<Save | typeof RACED> => {
  const held = await stacksHeldBy(db, userId)
  if (holdsName(held, stack.name)) return { outcome: "taken" }

  const saved = await insertUnlessNewName(db, userId, stack, held)

  return saved ? { outcome: "saved" } : RACED
}

type Rename =
  | { outcome: "renamed"; stack: typeof savedStacks.$inferSelect }
  | { outcome: "missing" }
  | { outcome: "taken" }

const renameUnlessHeld = async (
  db: Db,
  userId: string,
  id: string,
  name: string
): Promise<Rename | typeof RACED> => {
  const held = await stacksHeldBy(db, userId)
  // Ownership first: another person's id reads as no id, whatever its name.
  if (!held.some((stack) => stack.id === id)) return { outcome: "missing" }

  const others = held.filter((stack) => stack.id !== id)
  if (holdsName(others, name)) return { outcome: "taken" }

  const renamed = await renameUnlessNewName(db, userId, id, name, others)

  // No row: the condition failed, or the stack was deleted since the read;
  // the next attempt's read tells them apart.
  return renamed ? { outcome: "renamed", stack: renamed } : RACED
}

export const listStacks: RouteHandler<typeof listStacksRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const rows = await dbOf(c)
      .select()
      .from(savedStacks)
      .where(eq(savedStacks.userId, session.user.id))

    // A person's own stacks are few; sorting here avoids an index.
    return c.json(
      rows
        .map(withoutOwner)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      200
    )
  })

export const createStack: RouteHandler<typeof createStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const { name, configId } = c.req.valid("json")
    const now = new Date().toISOString()
    const stack = {
      id: crypto.randomUUID(),
      name,
      configId,
      createdAt: now,
      updatedAt: now,
    }

    const db = dbOf(c)
    const save = await retryLostRaces(() =>
      saveUnlessHeld(db, session.user.id, stack)
    )
    if (save.outcome === "taken") return c.json(NAME_TAKEN_BODY, 409)

    return c.json(stack, 201)
  })

export const renameStack: RouteHandler<typeof renameStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const { id } = c.req.valid("param")
    const { name } = c.req.valid("json")

    const db = dbOf(c)
    const rename = await retryLostRaces(() =>
      renameUnlessHeld(db, session.user.id, id, name)
    )

    switch (rename.outcome) {
      // 404, not 403: don't confirm another person's stack exists.
      case "missing":
        return c.json({ error: "not found" }, 404)
      case "taken":
        return c.json(NAME_TAKEN_BODY, 409)
      case "renamed":
        return c.json(withoutOwner(rename.stack), 200)
      default: {
        const _exhaustive: never = rename
        return _exhaustive
      }
    }
  })

export const deleteStack: RouteHandler<typeof deleteStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    await dbOf(c)
      .delete(savedStacks)
      .where(ownedStack(c.req.valid("param").id, session.user.id))

    // 204 either way: the request is "make this not exist".
    return c.body(null, 204)
  })
