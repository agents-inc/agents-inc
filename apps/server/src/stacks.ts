import { createRoute, z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"

import { UNAUTHORIZED, authenticated } from "./auth"
import { savedStacks } from "./db/app.schema"

import type { RouteHandler } from "@hono/zod-openapi"
import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

// What a stack looks like on the wire. `configId` is a pointer into KV rather
// than a payload — the bytes are fetched with the same `GET /configs/:id` a
// share link uses, by the same client, so nothing here duplicates the
// configuration contract or its version gate.
const savedStackSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    configId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("SavedStack")

// Long enough for a sentence, short enough that the column is not a place to
// put a document. A name is how a person tells two of their own stacks apart.
const nameSchema = z.string().trim().min(1).max(80)

const dbOf = (c: Context<WorkerEnv>) => drizzle(c.env.DATABASE)

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

// The owner is how a row is scoped and is nobody's business on the wire — the
// caller is the owner, so the column tells them what they already knew and
// tells anyone else something they should not have. Written once. It was
// written twice, in two spellings, and a projection that stops dropping a
// column does it in only one of them.
const withoutOwner = ({
  userId: _userId,
  ...stack
}: typeof savedStacks.$inferSelect) => stack

export const listStacks: RouteHandler<typeof listStacksRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const rows = await dbOf(c)
      .select()
      .from(savedStacks)
      .where(eq(savedStacks.userId, session.user.id))

    // Sorted here rather than in SQL: the list is a person's own stacks, which
    // is tens of rows at the outside, and an ORDER BY would need an index that
    // exists to serve nothing else.
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

    await dbOf(c)
      .insert(savedStacks)
      .values({ ...stack, userId: session.user.id })

    return c.json(stack, 201)
  })

// `and(id, userId)` on the write rather than a read-then-check: scoping the
// mutation itself is what makes another person's id un-actionable, and it
// cannot be forgotten between two statements.
export const renameStack: RouteHandler<typeof renameStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const { id } = c.req.valid("param")
    const { name } = c.req.valid("json")

    const [row] = await dbOf(c)
      .update(savedStacks)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(
        and(eq(savedStacks.id, id), eq(savedStacks.userId, session.user.id))
      )
      .returning()

    // 404 rather than 403 for somebody else's id, deliberately: telling a
    // stranger that a stack exists but is not theirs is telling them it
    // exists.
    if (!row) return c.json({ error: "not found" }, 404)

    return c.json(withoutOwner(row), 200)
  })

export const deleteStack: RouteHandler<typeof deleteStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    await dbOf(c)
      .delete(savedStacks)
      .where(
        and(
          eq(savedStacks.id, c.req.valid("param").id),
          eq(savedStacks.userId, session.user.id)
        )
      )

    // 204 whether or not a row went, because the caller's question is "make
    // this not exist" and the answer is the same either way.
    return c.body(null, 204)
  })
