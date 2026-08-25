import { describe, it, expect } from "vitest";
import { defaultCategories } from "../default-categories";
import type { Category, CategoryDefinition } from "../../../types";
import { CATEGORIES } from "../../../types/matrix";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import { typedKeys } from "../../../utils/typed-object";

const EXPECTED_CATEGORY_COUNT = 102;
const EXPECTED_EXCLUSIVE_COUNT = 35;

/**
 * Every field a built-in category declares, and the whole of it.
 *
 * A roster rather than a per-field `typeof` loop, because the loop beside it can only see the
 * fields it was told to look for: a field that LEAVES the shape is invisible to it, and a
 * leftover one nothing reads is invisible twice over — it still serialises into the generated
 * matrix, and from there into every catalogue the CLI and the editor parse.
 *
 * Constrained to `keyof CategoryDefinition` so a member the type stops carrying reddens on this
 * line rather than as an unassignable union member somewhere downstream. `icon` is a genuine
 * optional that no built-in category sets, so the clause is a membership test rather than an
 * exhaustive one.
 */
const CATEGORY_FIELDS = [
  "id",
  "displayName",
  "description",
  "domain",
  "exclusive",
  "order",
] as const satisfies readonly (keyof CategoryDefinition)[];

describe("defaultCategories", () => {
  it("has the expected number of categories", () => {
    const keys = typedKeys(defaultCategories);
    expect(keys).toHaveLength(EXPECTED_CATEGORY_COUNT);
  });

  it("defines every generated category", () => {
    const keys = typedKeys(defaultCategories);
    expect([...keys].sort()).toStrictEqual([...CATEGORIES].sort());
  });

  it("includes web-framework with correct fields", () => {
    expect(defaultCategories["web-framework"]).toStrictEqual({
      id: "web-framework",
      displayName: "Framework",
      description: "UI framework (React, Vue, Angular, SolidJS)",
      domain: "web",
      exclusive: true,
      order: 1,
    });
  });

  it("includes desktop-framework with correct fields", () => {
    expect(defaultCategories["desktop-framework"]).toStrictEqual({
      id: "desktop-framework",
      displayName: "Desktop Framework",
      description: "Desktop application framework (Tauri, Electron)",
      domain: "desktop",
      exclusive: true,
      order: 1,
    });
  });

  it("includes api-api with correct fields", () => {
    expect(defaultCategories["api-api"]).toStrictEqual({
      id: "api-api",
      displayName: "API Framework",
      description: "Backend framework (Hono, Express, Fastify)",
      domain: "api",
      exclusive: true,
      order: 1,
    });
  });

  it("includes cli-framework with correct fields", () => {
    expect(defaultCategories["cli-framework"]).toStrictEqual({
      id: "cli-framework",
      displayName: "CLI Framework",
      description: "CLI application framework (Commander, oclif)",
      domain: "cli",
      exclusive: true,
      order: 1,
    });
  });

  it("includes meta-reviewing", () => {
    expect(defaultCategories["meta-reviewing"]).toStrictEqual({
      id: "meta-reviewing",
      displayName: "Code Review",
      description: "Code review patterns and methodology",
      domain: "meta",
      exclusive: false,
      order: 1,
    });
  });

  it("includes meta-planning", () => {
    expect(defaultCategories["meta-planning"]).toStrictEqual({
      id: "meta-planning",
      displayName: "Planning",
      description: "Specification planning frameworks per domain",
      domain: "meta",
      exclusive: false,
      order: 4,
    });
  });

  it("includes shared-monorepo as non-exclusive, since a workspace manager composes with a task runner", () => {
    expect(defaultCategories["shared-monorepo"]).toStrictEqual({
      id: "shared-monorepo",
      displayName: "Monorepo",
      description: "Workspace management (pnpm workspaces)",
      domain: "shared",
      exclusive: false,
      order: 1,
    });
  });

  it("includes shared-task-runner as a pick-one, since a repo runs one orchestrator", () => {
    expect(defaultCategories["shared-task-runner"]).toStrictEqual({
      id: "shared-task-runner",
      displayName: "Task Runner",
      description: "Monorepo task orchestration (Turborepo, Nx)",
      domain: "shared",
      exclusive: true,
      order: 2,
    });
  });

  it("includes shared-lint as a pick-one, since the two toolchains replace each other", () => {
    expect(defaultCategories["shared-lint"]).toStrictEqual({
      id: "shared-lint",
      displayName: "Lint & Format",
      description: "Linting and formatting (Biome, ESLint & Prettier)",
      domain: "shared",
      exclusive: true,
      order: 3,
    });
  });

  it("names only what is left in shared-tooling after the lint skills leave", () => {
    expect(defaultCategories["shared-tooling"]).toStrictEqual({
      id: "shared-tooling",
      displayName: "Build Tooling",
      description: "TypeScript config, git hooks, changesets, stack detection",
      domain: "shared",
      exclusive: false,
      order: 4,
    });
  });

  it("no longer defines the duplicate API framework category", () => {
    expect("api-framework" in defaultCategories).toBe(false);
  });

  it("includes api-email as non-exclusive, since email setup and email usage are a pair", () => {
    expect(defaultCategories["api-email"]).toStrictEqual({
      id: "api-email",
      displayName: "Email",
      description: "Transactional email (Resend, Sendgrid)",
      domain: "api",
      exclusive: false,
      order: 11,
    });
  });

  it("leaves the categories whose members layer non-exclusive, fenced by their framework instead", () => {
    expect(defaultCategories["mobile-testing"].exclusive).toBe(false);
    expect(defaultCategories["desktop-multiwindow"].exclusive).toBe(false);
    expect(defaultCategories["desktop-security"].exclusive).toBe(false);
  });

  it("keeps desktop-packaging exclusive, since an app has one packaging pipeline", () => {
    expect(defaultCategories["desktop-packaging"].exclusive).toBe(true);
  });

  it("carries both non-exclusive flags into the generated matrix the wizard reads", () => {
    expect(BUILT_IN_MATRIX.categories["shared-monorepo"]).toStrictEqual({
      id: "shared-monorepo",
      displayName: "Monorepo",
      description: "Workspace management (pnpm workspaces)",
      domain: "shared",
      exclusive: false,
      order: 1,
    });
    expect(BUILT_IN_MATRIX.categories["api-email"]).toStrictEqual({
      id: "api-email",
      displayName: "Email",
      description: "Transactional email (Resend, Sendgrid)",
      domain: "api",
      exclusive: false,
      order: 11,
    });
  });

  it("splits the database bucket into one pick-one category per kind of data store", () => {
    expect(defaultCategories["api-sql-engine"]).toStrictEqual({
      id: "api-sql-engine",
      displayName: "SQL Engine",
      description: "Primary SQL engine (PostgreSQL, MySQL, CockroachDB)",
      domain: "api",
      exclusive: true,
      order: 2,
    });
    expect(defaultCategories["api-orm"]).toStrictEqual({
      id: "api-orm",
      displayName: "ORM / Query Builder",
      description: "Database access layer (Drizzle, Prisma, TypeORM)",
      domain: "api",
      exclusive: true,
      order: 3,
    });
    expect(defaultCategories["api-document"]).toStrictEqual({
      id: "api-document",
      displayName: "Document / Multi-Model Database",
      description: "Primary non-SQL store (MongoDB, Mongoose, Gel, SurrealDB)",
      domain: "api",
      exclusive: true,
      order: 4,
    });
    expect(defaultCategories["api-kv"]).toStrictEqual({
      id: "api-kv",
      displayName: "Cache / KV Store",
      description: "Redis-class key-value provider (Redis, Upstash)",
      domain: "api",
      exclusive: true,
      order: 5,
    });
    expect(defaultCategories["api-db-host"]).toStrictEqual({
      id: "api-db-host",
      displayName: "Managed Database",
      description: "Managed database host (Neon, PlanetScale, Turso)",
      domain: "api",
      exclusive: true,
      order: 6,
    });
  });

  it("no longer defines the bucket that fenced a cache against a database", () => {
    expect("api-database" in defaultCategories).toBe(false);
  });

  it("narrows the backend-platform bucket to the three that own auth, storage and functions", () => {
    expect(defaultCategories["api-baas"]).toStrictEqual({
      id: "api-baas",
      displayName: "Backend as a Service",
      description:
        "Full backend platform — auth, database, storage, functions (Supabase, Firebase)",
      domain: "api",
      exclusive: true,
      order: 7,
    });
  });

  it("separates the server-state pair from GraphQL clients and from type-safe RPC", () => {
    expect(defaultCategories["web-server-state"]).toStrictEqual({
      id: "web-server-state",
      displayName: "Server State / Data Fetching",
      description: "API data caching (React Query, SWR)",
      domain: "web",
      exclusive: true,
      order: 6,
    });
    expect(defaultCategories["web-graphql-client"]).toStrictEqual({
      id: "web-graphql-client",
      displayName: "GraphQL Client",
      description: "GraphQL client library (Apollo Client, urql)",
      domain: "web",
      exclusive: true,
      order: 7,
    });
    expect(defaultCategories["web-rpc"]).toStrictEqual({
      id: "web-rpc",
      displayName: "Type-Safe RPC",
      description: "End-to-end type-safe RPC (tRPC)",
      domain: "web",
      exclusive: false,
      order: 8,
    });
  });

  it("gives documentation generators their own pick-one, since a docs site is a second app", () => {
    expect(defaultCategories["web-docs"]).toStrictEqual({
      id: "web-docs",
      displayName: "Documentation Framework",
      description: "Documentation site generator (Docusaurus, VitePress)",
      domain: "web",
      exclusive: true,
      order: 16,
    });
  });

  it("fences the form libraries against each other and leaves validation open", () => {
    expect(defaultCategories["web-form-library"]).toStrictEqual({
      id: "web-form-library",
      displayName: "Form Library",
      description: "Form state and submission (React Hook Form, TanStack Form, VeeValidate)",
      domain: "web",
      exclusive: true,
      order: 10,
    });
    expect(defaultCategories["web-forms"]).toStrictEqual({
      id: "web-forms",
      displayName: "Validation",
      description: "Schema validation (Zod)",
      domain: "web",
      exclusive: false,
      order: 9,
    });
  });

  it("fences the design-system kits and leaves the headless primitives composing", () => {
    expect(defaultCategories["web-ui-kit"]).toStrictEqual({
      id: "web-ui-kit",
      displayName: "Design System Kit",
      description: "Pre-styled component kit (shadcn/ui, MUI, Mantine, Vuetify)",
      domain: "web",
      exclusive: true,
      order: 13,
    });
    expect(defaultCategories["web-ui-components"]).toStrictEqual({
      id: "web-ui-components",
      displayName: "Headless Components",
      description: "Headless primitives (Radix UI, Base UI, Headless UI, TanStack Table)",
      domain: "web",
      exclusive: false,
      order: 14,
    });
  });

  it("fences the browser drivers and leaves the rest of testing layering", () => {
    expect(defaultCategories["web-e2e"]).toStrictEqual({
      id: "web-e2e",
      displayName: "E2E Testing",
      description: "End-to-end browser testing (Playwright, Cypress)",
      domain: "web",
      exclusive: true,
      order: 12,
    });
    expect(defaultCategories["web-testing"]).toStrictEqual({
      id: "web-testing",
      displayName: "Testing",
      description: "Unit, component, and visual testing",
      domain: "web",
      exclusive: false,
      order: 11,
    });
  });

  it("moves one-way streaming out of the bidirectional realtime pick-one", () => {
    expect(defaultCategories["web-streaming"]).toStrictEqual({
      id: "web-streaming",
      displayName: "Server Streaming",
      description: "Server-sent events and HTTP streaming",
      domain: "web",
      exclusive: false,
      order: 24,
    });
    expect(defaultCategories["web-realtime"]).toStrictEqual({
      id: "web-realtime",
      displayName: "Realtime",
      description: "Bidirectional realtime (WebSockets, Socket.IO)",
      domain: "web",
      exclusive: true,
      order: 23,
    });
  });

  it("makes the categories a service picks one of say so themselves", () => {
    expect(defaultCategories["api-vector-db"].exclusive).toBe(true);
    expect(defaultCategories["api-search"].exclusive).toBe(true);
    expect(defaultCategories["api-cms"].exclusive).toBe(true);
  });

  it("shelves containerization with the containers, not with the pipelines", () => {
    expect(defaultCategories["infra-containers"]).toStrictEqual({
      id: "infra-containers",
      displayName: "Containers",
      description: "Containers (Docker, Kubernetes)",
      domain: "infra",
      exclusive: false,
      order: 5,
    });
  });

  it("counts the pick-one categories, since every one of them hard-errors a co-selection", () => {
    const exclusive = Object.values(defaultCategories).filter((cat) => cat.exclusive);

    expect(exclusive).toHaveLength(EXPECTED_EXCLUSIVE_COUNT);
  });

  it("gives every category its own displayName, so no two grid headers read the same", () => {
    const names = Object.values(defaultCategories).map((cat) => cat.displayName);
    const duplicated = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];

    expect(duplicated, "a repeated header makes two grid sections indistinguishable").toStrictEqual(
      [],
    );
  });

  it("gives every category its own order within its domain, so the grid sequence is total", () => {
    const ordersByDomain: Record<string, number[]> = {};
    for (const cat of Object.values(defaultCategories)) {
      (ordersByDomain[cat.domain] ??= []).push(cat.order);
    }
    const collisions = Object.entries(ordersByDomain).flatMap(([domain, orders]) =>
      orders.filter((order, i) => orders.indexOf(order) !== i).map((order) => `${domain}:${order}`),
    );

    expect([...new Set(collisions)]).toStrictEqual([]);
  });

  it("gives every category the fields the grid reads", () => {
    for (const [key, cat] of Object.entries(defaultCategories)) {
      expect(cat.id, `${key} missing id`).toBe(key as Category);
      expect(cat.displayName, `${key} missing displayName`).not.toBe("");
      expect(cat.description, `${key} missing description`).not.toBe("");
      expect(cat.domain, `${key} missing domain`).not.toBe("");
      expect(typeof cat.exclusive, `${key} exclusive not boolean`).toBe("boolean");
      expect(typeof cat.order, `${key} order not number`).toBe("number");
    }
  });

  it("gives every category those fields and no others", () => {
    for (const [key, cat] of Object.entries(defaultCategories)) {
      expect(
        Object.keys(cat).sort(),
        `${key} declares a field the catalogue has no reader for`,
      ).toStrictEqual([...CATEGORY_FIELDS].sort());
    }
  });
});
