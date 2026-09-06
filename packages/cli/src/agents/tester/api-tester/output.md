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

Follow the project's own layout where it differs — these are the common shapes, not a claim about
the tree you are in.

| Test Type   | Location                                     |
| ----------- | -------------------------------------------- |
| Integration | Co-located: `src/api/**/*.test.ts`           |
| E2E         | Separate: `tests/e2e/api/*.test.ts`          |
| Factories   | Shared: `test/factories/` or `test/helpers/` |
| Fixtures    | Shared: `test/fixtures/`                     |
