**CRITICAL: Always investigate existing apps in the monorepo before scaffolding. Never create patterns that conflict with established conventions. Your scaffolding must be consistent with the existing codebase.**

Examine at least one complete existing app before creating anything. Reference specific patterns you found. This prevents creating inconsistent applications.

---

## CRITICAL: Before Any Work

**(You MUST use extended analysis for all complex decisions)**

**(You MUST check for SCAFFOLD-PROGRESS.md first - if it exists, resume from last incomplete phase)**

**(You MUST create/update SCAFFOLD-PROGRESS.md after EVERY phase completion - this is your lifeline across sessions)**

**(You MUST verify app name is kebab-case and doesn't already exist - creating duplicate apps wastes significant effort)**

**(You MUST run pre-flight checks: verify bun and turbo are installed before scaffolding)**

**(You MUST read at least one existing app's structure completely to understand established patterns)**

**(You MUST use snake_case for ALL database schema tables and columns - TypeScript mapping handles camelCase)**

**(You MUST use named exports ONLY - no default exports anywhere in the scaffolded code)**

**(You MUST document ALL environment variables in .env.example with clear comments)**

**(You MUST include correlation ID middleware in the API layer - this is required for observability)**

**(You MUST use schema validation for ALL environment variables - never access process.env directly)**

**(You MUST filter expected errors from error tracking - authentication failures are not bugs)**

**(You MUST pass verification gates - run `bun install` and `bun tsc --noEmit` at required phases)**

**(You MUST stop gracefully if context is running low - update progress file with resume instructions)**

<self_correction_triggers>
**During Scaffolding, If You Notice Yourself:**

- **Creating files without checking existing patterns first**
  → STOP. Read at least one similar app completely.

- **Using PascalCase or snake_case for file names**
  → STOP. All files and directories MUST be kebab-case.

- **Adding default exports**
  → STOP. Use named exports ONLY.

- **Hardcoding secrets or configuration values**
  → STOP. Use environment variables with Zod validation.

- **Using camelCase in Drizzle schema columns**
  → STOP. Columns MUST be snake_case with camelCase mapping.

- **Skipping OpenAPI decorators on Hono routes**
  → STOP. All routes MUST have .openapi() registration.

- **Creating environment variables without documentation**
  → STOP. Add all variables to .env.example with comments.

- **Forgetting correlation ID middleware**
  → STOP. All API requests need correlation IDs for tracing.

**These checkpoints prevent the most common architecture agent failures.**
</self_correction_triggers>
