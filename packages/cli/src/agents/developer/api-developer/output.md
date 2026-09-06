## Output Format

<output_format>

Report your implementation in this structure.

<summary>
**Task:** [what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Symbol read       | What it showed             |
| --------------- | ----------------- | -------------------------- |
| [/path/to/file] | [function / type] | [pattern or utility found] |

**Patterns Identified:**

- **Route structure:** [how routes are registered — from /path, naming the symbol]
- **Validation approach:** [how input is validated — from /path, naming the symbol]
- **Error handling:** [how errors are shaped — from /path, naming the symbol]
- **Database access:** [the query patterns used — from /path, naming the symbol]

**Existing Code Reused:**

- [utility or middleware] from [/path] — [why reused rather than written]
  </investigation>

<approach>
**Summary:** [the implementation approach, in a sentence or two]

**Files:**

| File            | Action             | Purpose                |
| --------------- | ------------------ | ---------------------- |
| [/path/to/file] | [created/modified] | [what changed and why] |

**Key Decisions:**

- [decision]: [the existing pattern it follows, and where that pattern lives]
  </approach>

<implementation>

### [filename.ts]

**Location:** `/absolute/path/to/file.ts`
**Changes:** [e.g. "new route handler" or "added validation"]

```typescript
// [what this block does]
[implementation code]
```

**Design Notes:**

- [why this approach]
- [the existing pattern it matches]

</implementation>

<api_changes>

## Endpoints Added or Modified

### [METHOD] [/api/path]

**Handler:** `[symbol]` in `/path/to/route.ts`
**Auth required:** [the middleware that enforces it, or No]

**Request:**

```typescript
// path params / query params / body schema
{
}
```

**Success response:** [status code]

```typescript
{
}
```

**Error responses:**

| Status | Condition          | Response Shape                       |
| ------ | ------------------ | ------------------------------------ |
| 400    | Validation failed  | `{ error: string, details?: [...] }` |
| 401    | Not authenticated  | `{ error: string }`                  |
| 403    | Not authorized     | `{ error: string }`                  |
| 404    | Resource not found | `{ error: string }`                  |
| 500    | Server error       | `{ error: string }`                  |

</api_changes>

<database_changes>

## Schema Changes

### Table: [table_name]

**Defined by:** `[symbol]` in `/path/to/schema.ts`

| Column | Type   | Constraints                    | Purpose      |
| ------ | ------ | ------------------------------ | ------------ |
| [name] | [type] | [nullable, default, unique, …] | [why needed] |

**Relationships:** [one-to-many / many-to-many] with [other_table], via [foreign key]
**Indexes:** [columns] — [the query this serves]

## Migrations

**File:** `/path/to/migration.sql`
**Reversible:** [Yes, or No and why not]

```sql
-- migration SQL
```

</database_changes>

<security>

## Security Verification

**Input validation:**

- [ ] Every user-supplied value validated before use
- [ ] Queries parameterised or built through the ORM — never assembled by string concatenation
- [ ] Path traversal prevented, where the endpoint touches the filesystem
- [ ] Request size limits enforced

**Authentication and authorization:**

- [ ] Auth middleware applied to every protected route
- [ ] Identity and permission both checked — authentication alone answers only who is calling
- [ ] Resource ownership verified, so a caller reaches only their own records

**Sensitive data:**

- [ ] Secrets read from the environment, never committed
- [ ] No passwords, tokens or PII written to logs
- [ ] Sensitive fields excluded from responses
- [ ] Passwords hashed, where this touches credentials

**Rate limiting:**

- [ ] Applied where the endpoint is public
- [ ] Abuse vectors considered and named

**Notes:** [security decisions taken, and what they assume]

</security>

<error_handling>

## Error Handling

**Pattern followed:** `[symbol]` in `/path`

| Error Type     | HTTP Status | Handling                   | Logged? |
| -------------- | ----------- | -------------------------- | ------- |
| Validation     | 400         | Return validation details  | No      |
| Auth           | 401/403     | Return a generic message   | Yes     |
| Not Found      | 404         | Return a not-found message | No      |
| Business Logic | 400/422     | Return the specific error  | Depends |
| Database       | 500         | Log, return generic        | Yes     |
| Unknown        | 500         | Log, return generic        | Yes     |

Client errors take a 4xx and server errors a 5xx; the message a client sees never carries internals,
and the log carries enough to debug without carrying PII. The same error shape applies across every
endpoint, so a consumer parses one format.

**Logging:** [what each error record carries — correlation id, user id, request path] at [level]

</error_handling>

<tests>

### [filename.test.ts]

**Location:** `/absolute/path/to/file.test.ts`

```typescript
[test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Validation errors: [scenarios]
- [x] Auth errors: [scenarios]
- [x] Edge cases: [scenarios]

**Test command:** `[the command that runs these]`

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                             |
| -------------------- | --------- | ------------------------------------ |
| [from specification] | PASS/FAIL | [test name, request, or observation] |

## Quality Checks

**API design:**

- [ ] The project's conventions followed, REST or GraphQL
- [ ] Response format consistent with the endpoints beside it
- [ ] Status codes appropriate to each outcome
- [ ] `PUT` and `DELETE` idempotent
- [ ] List endpoints paginated, and filterable where callers need it
- [ ] Versioning considered, where this breaks an existing consumer

**Database:**

- [ ] No N+1 — related data fetched in one query rather than inside a loop
- [ ] Indexes present for the columns this queries on
- [ ] Multi-step operations wrapped in a transaction, atomic as a unit
- [ ] Soft-delete checks applied where the project soft-deletes
- [ ] Connections returned to the pool rather than leaked

**Code Quality:**

- [ ] Named constants rather than magic numbers
- [ ] No `any` without a justification in a comment
- [ ] Naming and file placement match the files you read
- [ ] Configuration read from the environment rather than hardcoded

**Observability:**

- [ ] Errors logged with enough context to debug them
- [ ] Metrics or tracing hooks, where the project has them

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass
- [ ] Build succeeds, with no type or lint errors
- [ ] Migrations run, where the change adds one

</verification>

<notes>

## For Reviewer

- [where to focus]
- [decisions worth discussing]
- [alternatives considered and rejected]

## Scope Control

**Added:** [what the spec asked for]
**Did not add:** [what was tempting and out of scope]

## Known Limitations

- [scope reduced from the spec, debt taken on, or behaviour under load, and why]

## Dependencies

- [packages added: none, or each with its justification]
- [breaking changes: none, or what breaks]
- [migration required: yes or no]

</notes>

</output_format>

---

## When to Include Each Section

| Section              | When Required                          |
| -------------------- | -------------------------------------- |
| `<summary>`          | Always                                 |
| `<investigation>`    | Always — it evidences the research     |
| `<approach>`         | Always — it evidences the planning     |
| `<implementation>`   | Always — the actual code               |
| `<api_changes>`      | When endpoints are added or modified   |
| `<database_changes>` | When schema or migrations change       |
| `<security>`         | Always, for backend work               |
| `<error_handling>`   | Always — it states the error strategy  |
| `<tests>`            | When tests are part of the task        |
| `<verification>`     | Always — it evidences completion       |
| `<notes>`            | When there is context for the reviewer |
