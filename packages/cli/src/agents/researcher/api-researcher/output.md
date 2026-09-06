## Output Format

<output_format>

**Report the sections your research covered and omit the rest.** A findings document's size follows
the question's size rather than this template's, and a section padded to fill the shape costs the
reader more than an absent one does.

<research_summary>
**Research Topic:** [What was researched]
**Confidence:** [High | Medium | Low] - based on how consistently the source confirms the claims
**Files Examined:** [count]
**Open Questions:** [what the codebase did not settle, or "none"]
</research_summary>

<route_patterns>

## Route Patterns

| Method | Path   | Handler       | Middleware        | Auth     |
| ------ | ------ | ------------- | ----------------- | -------- |
| [GET]  | [path] | `/path:lines` | [chain, in order] | [yes/no] |

### Route: [METHOD /path]

**Handler:** `/path/to/route.ts:lines`
**Middleware Chain:** `[first] → [second] → handler` — mounted at `/path:lines`

**Request Validation:**

```typescript
// From /path/to/route.ts:lines
```

**Response Shape:** [success body, and the error bodies a client can receive]

**Invalid Input Behaviour:** [status code, body, and where it is produced]
</route_patterns>

<database_patterns>

## Database Patterns

### Schema: [TableName]

**Location:** `/path/to/schema.ts:lines`

```typescript
// The actual table definition, copied from the schema
```

**Relationships:**

| Relation | Type   | Foreign Key | Target   | On Delete   |
| -------- | ------ | ----------- | -------- | ----------- |
| [name]   | [kind] | [column]    | [target] | [behaviour] |

### Query Patterns

| Operation | Location      | Shape                  |
| --------- | ------------- | ---------------------- |
| [name]    | `/path:lines` | [the call, as written] |

**Transactions:** `/path:lines` - [when a transaction is used, and what it wraps]
</database_patterns>

<auth_patterns>

## Authentication and Authorization

**Session Handling:** `/path/to/auth.ts:lines` - [how a request becomes a principal]

**Permission Check Pattern:**

```typescript
// From /path:lines
```

**Coverage:** [which routes mount the check, and which do not — absence is a finding]

**Token Lifecycle:** [issue, refresh, expiry, with locations]
</auth_patterns>

<middleware_patterns>

## Middleware and Error Handling

| Order | Middleware | Location      | Purpose        | Applies To     |
| ----- | ---------- | ------------- | -------------- | -------------- |
| 1     | [name]     | `/path:lines` | [what it does] | [which routes] |

**Error Handler:**

```typescript
// From /path:lines - how a thrown error becomes a response
```

**Error-to-Status Mapping:** [error class → status code, with locations]

**Logging Convention:** `/path:lines` - [levels, and what each is used for]
</middleware_patterns>

<configuration>

## Configuration

| Setting | Env var name | Read at       | Default |
| ------- | ------------ | ------------- | ------- |
| [name]  | [VAR_NAME]   | `/path:lines` | [value] |

Credential values are never reproduced here — only the variable names and the files that read them.
</configuration>

<implementation_guidance>

## For the Backend Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Anti-pattern observed] - inconsistent with `/path:lines`

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

</implementation_guidance>
</output_format>

---

## The Bar

Every finding carries a verified path, the line range, the code as it actually reads, how many
instances exist, and what the developer should do with it. The difference is what a developer can
act on:

**Below the bar** — true, and worth nothing:

```markdown
The codebase uses Drizzle ORM for database access.
```

**At the bar** — the same claim, actionable:

```markdown
**ORM:** Drizzle — schema at `/packages/database/src/schema.ts`

**Table definition:** `/packages/database/src/schema.ts:45-62` — `pgTable` with typed columns
**Query shape:** `/apps/api/src/services/user-service.ts:23-35` — `db.select().from(users).where(eq(...))`

Read `/packages/database/src/schema.ts` first, then the service for the query convention.
```

The paths above illustrate the shape. Write the ones you actually opened.
