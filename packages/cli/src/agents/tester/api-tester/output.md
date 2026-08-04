## Output Format

<output_format>
Provide your API test output in this structure:

<test_summary>
**Feature:** [What's being tested - e.g., "User CRUD endpoints"]
**Test File:** [/path/to/feature.test.ts]
**Test Count:** [X] tests across [Y] categories
**Test Type:** [Integration | Auth | Contract | Database]
**Status:** [All tests passing | Tests written - ready for verification]
</test_summary>

<test_suite>

## Test Coverage Summary

| Category           | Count   | Description                                  |
| ------------------ | ------- | -------------------------------------------- |
| Success Paths      | [X]     | Valid requests with expected responses       |
| Request Validation | [X]     | Malformed input, missing fields, type errors |
| Auth Boundaries    | [X]     | Unauthenticated, wrong role, expired token   |
| Error Responses    | [X]     | 404, 409, 422, 500 shape and message         |
| Database State     | [X]     | Record creation, updates, deletes verified   |
| Edge Cases         | [X]     | Empty lists, pagination bounds, concurrency  |
| **Total**          | **[X]** |                                              |

</test_suite>

<test_code>

## Test File

**File:** `/path/to/feature.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
// ... other imports (request helper, db, factories)

describe("[Endpoint Group]", () => {
  beforeAll(async () => {
    // Seed test database
  });

  afterAll(async () => {
    // Clean up test data
  });

  describe("Success Paths", () => {
    it("returns 200 with expected shape", async () => {
      // Test implementation
    });
  });

  describe("Request Validation", () => {
    it("returns 400 for missing required fields", async () => {
      // Test implementation
    });
  });

  describe("Auth Boundaries", () => {
    it("returns 401 without auth token", async () => {
      // Test implementation
    });

    it("returns 403 for insufficient permissions", async () => {
      // Test implementation
    });
  });

  describe("Error Responses", () => {
    it("returns 404 for nonexistent resource", async () => {
      // Test implementation
    });
  });

  describe("Database State", () => {
    it("creates record with correct fields", async () => {
      // Test implementation — verify DB after write
    });
  });
});
```

</test_code>

<coverage_analysis>

## Behaviors Covered

### Success Paths

- [Endpoint returns expected data shape]
- [Pagination works with limit/offset]
- [Filtering returns matching records]

### Request Validation

- [Missing required fields rejected]
- [Invalid types rejected]
- [Exceeds max length rejected]

### Auth Boundaries

- [Unauthenticated requests rejected]
- [Wrong role returns 403]
- [Expired token returns 401]
- [Resource ownership enforced]

### Error Responses

- [404 for missing resources]
- [409 for duplicate entries]
- [500 does not leak internals]

### Database State

- [Record created with correct fields]
- [Soft delete sets deletedAt]
- [Cascade deletes related records]

## What's NOT Covered (Intentionally)

- [Excluded scenario] - [Reason]

</coverage_analysis>

<verification_commands>

## Verification

**Run tests:**

```bash
# Run specific test file (use project's test runner)
npm test -- [path/to/feature.test.ts]

# Run with verbose output
npm test -- [path/to/feature.test.ts] --reporter=verbose

# Run all API tests
npm test -- src/api/
```

**Expected results:**

- All tests should pass
- No hanging tests (indicates unclosed connections)
- No flaky tests (indicates shared database state)

</verification_commands>

<test_patterns_used>

## Patterns Applied

| Pattern             | Usage                                                  |
| ------------------- | ------------------------------------------------------ |
| Seed in beforeAll   | Create test data before suite runs                     |
| Cleanup in afterAll | Remove test data after suite completes                 |
| Per-test cleanup    | `afterEach` for write operations that must not leak    |
| Auth token helpers  | Project's existing token generation for each role      |
| DB state assertions | Query database directly after write operations         |
| Shape assertions    | `toStrictEqual` with `expect.any()` for dynamic fields |
| Error shape checks  | Verify `{ error: string }` contract on all error paths |

</test_patterns_used>

</output_format>

---

## Section Guidelines

### API Test Quality Requirements

| Requirement                    | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| **Seed/teardown per suite**    | Each describe block manages its own database state |
| **Status + body assertions**   | Every request asserts both status code and shape   |
| **Auth coverage per endpoint** | Every protected route tested without/wrong auth    |
| **Database verification**      | Write operations verified by direct DB query       |
| **Error shape consistency**    | All error responses match the project's contract   |
| **No shared mutable state**    | Tests must run independently and in parallel       |

### Common HTTP Status Codes to Test

| Status | Meaning               | When to Test                           |
| ------ | --------------------- | -------------------------------------- |
| 200    | OK                    | Successful GET, PUT, PATCH             |
| 201    | Created               | Successful POST                        |
| 204    | No Content            | Successful DELETE                      |
| 400    | Bad Request           | Validation failures                    |
| 401    | Unauthorized          | Missing or invalid auth token          |
| 403    | Forbidden             | Valid auth but insufficient permission |
| 404    | Not Found             | Resource does not exist                |
| 409    | Conflict              | Duplicate key or state conflict        |
| 422    | Unprocessable Entity  | Semantic validation failure            |
| 429    | Too Many Requests     | Rate limit exceeded                    |
| 500    | Internal Server Error | Unhandled server error                 |

### Test File Location Convention

| Test Type   | Location                                     |
| ----------- | -------------------------------------------- |
| Integration | Co-located: `src/api/**/*.test.ts`           |
| E2E         | Separate: `tests/e2e/api/*.test.ts`          |
| Factories   | Shared: `test/factories/` or `test/helpers/` |
| Fixtures    | Shared: `test/fixtures/`                     |

## Example Test Output

Here's what a complete, high-quality API test file handoff looks like:

```markdown
# Test Suite: User CRUD Endpoints

## Test File

`src/api/routes/users/__tests__/users.test.ts`

## Coverage Summary

- Success Paths: 5 tests
- Request Validation: 4 tests
- Auth Boundaries: 4 tests
- Error Responses: 3 tests
- Database State: 3 tests
- **Total: 19 tests**

## Test Categories

### Success Paths

- GET /api/users returns 200 with paginated list
- GET /api/users/:id returns 200 with user object
- POST /api/users returns 201 with created user
- PUT /api/users/:id returns 200 with updated user
- DELETE /api/users/:id returns 204

### Request Validation

- POST /api/users returns 400 for missing name
- POST /api/users returns 400 for invalid email format
- PUT /api/users/:id returns 400 for empty body
- GET /api/users returns 400 for negative page offset

### Auth Boundaries

- GET /api/users returns 401 without token
- DELETE /api/users/:id returns 403 for non-admin
- PUT /api/users/:id returns 403 when editing other user
- GET /api/users returns 401 for expired token

### Error Responses

- GET /api/users/:id returns 404 for nonexistent ID
- POST /api/users returns 409 for duplicate email
- All error responses match { error: string } shape

### Database State

- POST creates record with correct fields and timestamps
- PUT updates only specified fields
- DELETE sets deletedAt (soft delete)

## Test Status

All tests: PASSING

## Investigation Findings

- Test runner: vitest with supertest for HTTP assertions
- Auth tokens: generated via `createTestToken(role)` from test/helpers
- Database: test transactions rolled back in afterEach
- Seed data: `UserFactory.create()` from test/factories

## Patterns Applied

- Used existing `createTestToken("admin")` for admin auth
- Used existing `UserFactory.create()` for seed data
- Followed `orders.test.ts` pattern for request/response shape
- Database assertions query via `db.select()` after write ops
```
