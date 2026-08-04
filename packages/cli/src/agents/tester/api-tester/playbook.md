## Your Investigation Process

Before writing API tests:

```xml
<test_planning>
1. **Understand the API surface**
   - What endpoints exist? What HTTP methods?
   - What request bodies, query params, path params?
   - What response shapes and status codes?
   - What auth/permissions are required?

2. **Examine existing test patterns**
   - Look at existing *.test.ts files for conventions
   - Check for test utilities, factories, and fixtures
   - Note how database seeding/teardown is handled
   - Identify the test runner and assertion library in use

3. **Map the data flow**
   - What database tables are read/written?
   - What middleware runs before the handler?
   - What external services are called?
   - What side effects occur (emails, queues, webhooks)?

4. **Plan test categories**
   - Request validation (malformed input, missing fields, type errors)
   - Success paths (correct input, expected output shape)
   - Auth boundaries (unauthenticated, wrong role, expired token)
   - Database state (created records, updated fields, cascade deletes)
   - Error responses (404, 409, 422, 500 — shape and message)
   - Edge cases (empty lists, max pagination, concurrent writes)
</test_planning>
```

---

## API Testing Workflow

**ALWAYS verify the testing environment first:**

```xml
<api_testing_workflow>
**SETUP: Verify Configuration**
1. Check test runner config (vitest, jest, or framework-specific)
2. Check for existing test database setup/teardown utilities
3. Look for request helpers (supertest, app.request, fetch wrappers)
4. Find existing seed data factories and fixture patterns
5. Identify how auth tokens are generated in tests

**WRITE: Create Comprehensive Tests**
1. Set up test database state in beforeAll/beforeEach
2. Clean up database state in afterAll/afterEach
3. Test each endpoint method (GET, POST, PUT, PATCH, DELETE)
4. Test auth boundaries for every protected route
5. Verify response status codes AND response body shapes
6. Test request validation rejects malformed input
7. Verify database state changes after write operations

**VERIFY: Ensure Tests Are Valid**
1. Run tests with the project's test command
2. Verify tests fail for expected reasons (not setup errors)
3. Check tests pass after implementation exists
4. Confirm database cleanup prevents test pollution

**ITERATE: Fix and Improve**
1. If tests are flaky, check for shared database state
2. If tests hang, check for unclosed connections or missing cleanup
3. If assertions fail on shape, verify against actual API response
4. If auth tests pass unexpectedly, verify middleware is applied
</api_testing_workflow>
```

---

## Test Categories

### 1. Endpoint Integration Tests

Test the full HTTP request/response cycle:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

describe("GET /api/users", () => {
  beforeAll(async () => {
    await seedTestUsers();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("returns 200 with paginated user list", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("total");
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("supports pagination with limit and offset", async () => {
    const res = await request(app)
      .get("/api/users?limit=5&offset=0")
      .set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });
});
```

### 2. Database Operation Tests

Test that write operations modify state correctly:

```typescript
describe("POST /api/users", () => {
  afterEach(async () => {
    await db.delete(users).where(eq(users.email, "new@test.com"));
  });

  it("creates a user and returns 201", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "New User", email: "new@test.com" });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("new@test.com");

    // Verify database state
    const dbUser = await db.select().from(users).where(eq(users.email, "new@test.com"));
    expect(dbUser).toHaveLength(1);
  });

  it("returns 409 when email already exists", async () => {
    // Seed duplicate
    await db.insert(users).values({ name: "Existing", email: "new@test.com" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Duplicate", email: "new@test.com" });

    expect(res.status).toBe(409);
  });
});
```

### 3. Auth Flow Tests

Test authentication and authorization boundaries:

```typescript
describe("Auth boundaries", () => {
  it("rejects expired tokens with 401", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it("rejects insufficient permissions with 403", async () => {
    const res = await request(app)
      .delete("/api/users/1")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });

  it("allows admin to access admin-only routes", async () => {
    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});
```

### 4. Middleware Chain Tests

Test request pipeline ordering and middleware behavior:

```typescript
describe("Rate limiting middleware", () => {
  it("allows requests under the limit", async () => {
    const res = await request(app).get("/api/public/health");
    expect(res.status).toBe(200);
  });

  it("returns 429 when rate limit exceeded", async () => {
    // Exhaust rate limit
    for (let i = 0; i < RATE_LIMIT; i++) {
      await request(app).get("/api/public/health");
    }

    // Next request should be rejected
    const res = await request(app).get("/api/public/health");
    expect(res.status).toBe(429);
    expect(res.headers).toHaveProperty("retry-after");
  });
});
```

### 5. Error Response Validation

Test that error responses have consistent shape:

```typescript
describe("Error response contract", () => {
  it("returns validation errors with field details", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "" }); // missing required fields

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("details");
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it("returns 404 with standard error shape for missing resources", async () => {
    const res = await request(app)
      .get("/api/users/nonexistent-id")
      .set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toStrictEqual({ error: expect.any(String) });
  });

  it("does not leak stack traces in production errors", async () => {
    const res = await request(app)
      .get("/api/trigger-error")
      .set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty("stack");
    expect(res.body.error).not.toContain("at Object");
  });
});
```

---

<retrieval_strategy>

## Just-in-Time Loading

**When exploring API test patterns:**

- Start with existing tests: `**/*.test.ts`, `**/*.spec.ts`
- Look for test utilities: `test/helpers`, `test/utils`, `test/setup`
- Check for seed/factory files: `test/fixtures`, `test/factories`
- Find route definitions to understand available endpoints
- Read middleware files to understand request pipeline

**Tool usage:**

1. Glob to find test files matching patterns
2. Grep to search for specific patterns (describe blocks, supertest usage)
3. Read only files needed for the current test suite

This preserves context window for actual test writing.

</retrieval_strategy>
