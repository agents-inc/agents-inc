## Output Format

<output_format>
Provide your research findings in this structure:

<research_summary>
**Research Topic:** [What was researched]
**Confidence:** [High | Medium | Low]
**Files Examined:** [count]
</research_summary>

<route_patterns>

## API Route Patterns

### Route: [METHOD /path]

**Handler:** `/path/to/route.ts:lines`
**Middleware Chain:** `[middleware1] → [middleware2] → handler`

**Request Validation:**

```typescript
// From /path/to/route.ts:lines
const schema = z.object({...})
```

**Response Format:**

```typescript
// Successful response structure
{ data: T, meta?: {...} }
```

**Error Handling:**

```typescript
// From /path/to/route.ts:lines
// How errors are thrown/caught
```

</route_patterns>

<database_patterns>

## Database Patterns

### Schema: [TableName]

**Location:** `/path/to/schema.ts:lines`

```typescript
// Actual schema definition
export const users = pgTable('users', {...})
```

**Relationships:**

- `users` → `posts` (one-to-many)
- `users` → `organizations` (many-to-many via `user_orgs`)

### Query Patterns

| Operation         | Location      | Pattern                               |
| ----------------- | ------------- | ------------------------------------- |
| Select with joins | `/path:lines` | `db.select().from(x).leftJoin(y)`     |
| Transaction       | `/path:lines` | `db.transaction(async (tx) => {...})` |
| Soft delete       | `/path:lines` | `update().set({ deletedAt })`         |

</database_patterns>

<auth_patterns>

## Authentication Patterns

**Session Handling:** `/path/to/auth.ts`
**Permission Check Pattern:**

```typescript
// From /path:lines
const requireRole = (role: Role) => {...}
```

**Protected Route Pattern:**

```typescript
// From /path:lines
```

</auth_patterns>

<middleware_patterns>

## Middleware Patterns

| Middleware | Location      | Purpose        | Applies To     |
| ---------- | ------------- | -------------- | -------------- |
| [name]     | [/path:lines] | [what it does] | [which routes] |

**Error Middleware:**

```typescript
// From /path:lines
// How errors are transformed to responses
```

**Logging Pattern:**

```typescript
// From /path:lines
logger.info({ ... }, 'message')
```

</middleware_patterns>

<implementation_guidance>

## For Backend Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Anti-pattern] - why

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

</implementation_guidance>
</output_format>

## Example Research Output

### API Route Research: User Endpoints

````markdown
## Research Findings: User API Routes

**Research Type:** API Route Discovery
**Files Examined:** 12

---

### Route Inventory

| Method | Path           | Handler Location                   | Auth | Description      |
| ------ | -------------- | ---------------------------------- | ---- | ---------------- |
| GET    | /api/users/:id | `/apps/api/src/routes/users.ts:15` | Yes  | Get user by ID   |
| PATCH  | /api/users/:id | `/apps/api/src/routes/users.ts:35` | Yes  | Update user      |
| GET    | /api/users/me  | `/apps/api/src/routes/users.ts:55` | Yes  | Get current user |

---

### Route Handler Pattern

**File:** `/apps/api/src/routes/users.ts:15-33`

```typescript
app.get(
  "/users/:id",
  zValidator("param", z.object({ id: z.string().uuid() })),
  authMiddleware,
  async (c) => {
    const { id } = c.req.valid("param");
    const user = await userService.findById(id);
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json(user);
  },
);
```
````

---

### Middleware

- **Auth:** `/apps/api/src/middleware/auth.ts:8-25` - Validates session, attaches user
- **Error:** `/apps/api/src/middleware/error.ts:5-20` - Catches errors, logs to Pino

---

### Files to Reference

1. `/apps/api/src/routes/users.ts` - User routes example
2. `/apps/api/src/middleware/auth.ts` - Auth middleware
3. `/apps/api/src/services/user-service.ts` - Service layer pattern

````

---

### Database Schema Research: Posts

```markdown
## Research Findings: Database Schema for Posts

**Research Type:** Database Pattern Research
**Files Examined:** 6

---

### Table Definition

**File:** `/packages/database/src/schema.ts:78-95`

```typescript
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
````

---

### Relationships

| Relation | Type         | Foreign Key | Target          |
| -------- | ------------ | ----------- | --------------- |
| author   | many-to-one  | authorId    | users.id        |
| comments | one-to-many  | -           | comments.postId |
| tags     | many-to-many | -           | posts_to_tags   |

---

### Query Patterns

- **Select with relations:** `db.query.posts.findMany({ with: { author: true } })`
- **Insert with returning:** `db.insert(posts).values({...}).returning()`

---

### Files to Reference

1. `/packages/database/src/schema.ts` - Table definitions
2. `/apps/api/src/services/post-service.ts` - Query patterns
3. `/packages/database/drizzle/` - Migration examples

```

```
