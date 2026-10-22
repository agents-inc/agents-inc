import { createRoute, z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"

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

// The owner is the caller, so the column is dropped from the wire.
const withoutOwner = ({
  userId: _userId,
  ...stack
}: typeof savedStacks.$inferSelect) => stack

// Scoping the mutation itself makes another person's id un-actionable.
const ownedStack = (id: string, userId: string) =>
  and(eq(savedStacks.id, id), eq(savedStacks.userId, userId))

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

    await dbOf(c)
      .insert(savedStacks)
      .values({ ...stack, userId: session.user.id })

    return c.json(stack, 201)
  })

export const renameStack: RouteHandler<typeof renameStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const { id } = c.req.valid("param")
    const { name } = c.req.valid("json")

    const [row] = await dbOf(c)
      .update(savedStacks)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(ownedStack(id, session.user.id))
      .returning()

    // 404, not 403: don't confirm another person's stack exists.
    if (!row) return c.json({ error: "not found" }, 404)

    return c.json(withoutOwner(row), 200)
  })

export const deleteStack: RouteHandler<typeof deleteStackRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    await dbOf(c)
      .delete(savedStacks)
      .where(ownedStack(c.req.valid("param").id, session.user.id))

    // 204 either way: the request is "make this not exist".
    return c.body(null, 204)
  })
