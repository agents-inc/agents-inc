// AUTO-GENERATED from packages/cli/src/agents/*/*/metadata.yaml in this repo.
// Do not edit manually — run `bun run generate` in packages/matrix.
// Fills the AGENT_DEFINITIONS gap described in the CLI's todo/D-239.

import type { AgentName } from "../vendor/generated/source-types"
import type { ModelName, PermissionMode } from "../vendor/matrix"

/** Agent metadata as shipped by the CLI's per-agent metadata.yaml files. */
export type GeneratedAgentDefinition = {
  id: AgentName
  title: string
  description: string
  model?: ModelName
  tools: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  outputFormat?: string
  /** Agent role, from the CLI's src/agents/<flavor>/ directory. */
  flavor: string
  /** Path relative to the CLI's src/agents/. */
  path: string
}

export const AGENT_DEFINITIONS = {
  "agent-summoner": {
    "id": "agent-summoner",
    "title": "Agent Summoner Agent",
    "description": "Expert in creating agents and skills - understands agent architecture deeply - invoke when you need to create, improve, or analyze agents/skills",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "meta",
    "path": "meta/agent-summoner",
  },
  "ai-developer": {
    "id": "ai-developer",
    "title": "AI Developer Agent",
    "description": "Implements AI features from specs - RAG pipelines, agent loops, tool calling, prompt engineering, streaming responses, embedding workflows, multi-model orchestration - surgical execution following existing patterns",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/ai-developer",
  },
  "ai-reviewer": {
    "id": "ai-reviewer",
    "title": "AI Reviewer Agent",
    "description": "Reviews AI integration code - prompt safety, injection risks, output validation, token budgets, retry/fallback patterns, cost control, model versioning, streaming robustness - defers REST/DB to api-reviewer, UI to web-reviewer",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/ai-reviewer",
  },
  "api-developer": {
    "id": "api-developer",
    "title": "API Developer Agent",
    "description": "Implements backend features from detailed specs - API routes, database operations, server utilities, authentication, middleware - surgical execution following existing patterns - invoke AFTER web-pm creates spec",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/api-developer",
  },
  "api-pm": {
    "id": "api-pm",
    "title": "API PM and Architect Agent",
    "description": "Creates detailed backend implementation specs - API contract design, database schema, middleware ordering, auth flow architecture, error handling strategy - invoke BEFORE api-developer for any backend feature",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "planning",
    "path": "planning/api-pm",
  },
  "api-researcher": {
    "id": "api-researcher",
    "title": "API Researcher Agent",
    "description": "Read-only backend research specialist - discovers API route patterns, understands database schemas and ORM patterns, catalogs middleware and authentication flows, finds similar service implementations - produces structured findings for api-developer - invoke for backend research before implementation",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "researcher",
    "path": "researcher/api-researcher",
  },
  "api-reviewer": {
    "id": "api-reviewer",
    "title": "API Reviewer Agent",
    "description": "Reviews non-component code - API routes, server utils, configs (*.config.*), build tooling, CI/CD (*.yml), security, env management - defers UI components to web-reviewer",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/api-reviewer",
  },
  "api-tester": {
    "id": "api-tester",
    "title": "API Tester Agent",
    "description": "Tests backend features - API endpoint integration tests, database operation tests, auth flow tests, middleware chain tests, error response validation - invoke BEFORE or AFTER api-developer implements features",
    "model": "sonnet",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "tester",
    "path": "tester/api-tester",
  },
  "cli-developer": {
    "id": "cli-developer",
    "title": "CLI Developer Agent",
    "description": "Implements CLI features from detailed specs - CLI commands, interactive prompts, option parsing, config hierarchies, exit codes - surgical execution following existing patterns - invoke AFTER pm creates spec",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/cli-developer",
  },
  "cli-reviewer": {
    "id": "cli-reviewer",
    "title": "CLI Reviewer Agent",
    "description": "Reviews CLI code ONLY - CLI commands, interactive prompts, exit codes, SIGINT handling, error messages, user feedback patterns - defers non-CLI code to api-reviewer",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/cli-reviewer",
  },
  "cli-tester": {
    "id": "cli-tester",
    "title": "CLI Tester Agent",
    "description": "Tests CLI applications - wizard flows, commands, keyboard interactions, file system outputs - invoke BEFORE or AFTER cli-developer implements features",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "tester",
    "path": "tester/cli-tester",
  },
  "codex-keeper": {
    "id": "codex-keeper",
    "title": "Codex Keeper Agent",
    "description": "Creates AI-focused reference documentation (architecture, types, store maps, commands) that helps other agents understand where and how to implement features. Works incrementally, tracking progress over time.",
    "model": "opus",
    "tools": ["Read","Write","Edit","Glob","Grep","Bash"],
    "flavor": "meta",
    "path": "meta/codex-keeper",
  },
  "convention-keeper": {
    "id": "convention-keeper",
    "title": "Convention Keeper Agent",
    "description": "Reviews accumulated findings from sub-agent work, cross-references against existing standards docs, and proposes targeted documentation updates to prevent recurrence of anti-patterns",
    "model": "sonnet",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "meta",
    "path": "meta/convention-keeper",
  },
  "infra-reviewer": {
    "id": "infra-reviewer",
    "title": "Infrastructure Reviewer Agent",
    "description": "Reviews infrastructure code ONLY - Dockerfiles, CI/CD pipelines, deployment configs, secret handling, env management, build optimization, IaC - defers application code to api-reviewer/web-reviewer",
    "model": "sonnet",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/infra-reviewer",
  },
  "pattern-scout": {
    "id": "pattern-scout",
    "title": "Pattern Scout Agent",
    "description": "Extracts ALL patterns from monorepo (15+ categories - code, architecture, testing, design, build, CI/CD, env, security) - creates comprehensive standards - invoke for new codebases",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "pattern",
    "path": "pattern/pattern-scout",
  },
  "skill-summoner": {
    "id": "skill-summoner",
    "title": "Skill Summoner Agent",
    "description": "Creates technology-specific skills by researching best practices and comparing with codebase standards - use for state management, styling, API frameworks, and other technology skills",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","WebSearch","WebFetch"],
    "flavor": "meta",
    "path": "meta/skill-summoner",
  },
  "web-architecture": {
    "id": "web-architecture",
    "title": "Web Architecture Agent",
    "description": "Scaffolds new applications in the monorepo with all foundational patterns (authentication, database, API, analytics, observability, CI/CD)",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/web-architecture",
  },
  "web-developer": {
    "id": "web-developer",
    "title": "Web Developer Agent",
    "description": "Implements frontend features from detailed specs - UI components, TypeScript, styling, client state - surgical execution following existing patterns - invoke AFTER web-pm creates spec",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/web-developer",
  },
  "web-pattern-critique": {
    "id": "web-pattern-critique",
    "title": "Web Pattern Critique Agent",
    "description": "Critiques extracted patterns against industry standards (Airbnb, Stripe, Meta, Vercel) - frontend architecture focus - invoke AFTER pattern-scout extracts patterns",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "pattern",
    "path": "pattern/web-pattern-critique",
  },
  "web-pm": {
    "id": "web-pm",
    "title": "Web PM and Architect Agent",
    "description": "Creates detailed implementation specs by researching codebase patterns - architectural planning and requirements gathering - invoke BEFORE developer for any new feature",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "planning",
    "path": "planning/web-pm",
  },
  "web-researcher": {
    "id": "web-researcher",
    "title": "Web Researcher Agent",
    "description": "Read-only frontend research specialist - discovers UI component patterns, catalogs design systems, understands styling methodology and tokens, finds similar component implementations - produces structured findings for web-developer - invoke for frontend research before implementation",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "researcher",
    "path": "researcher/web-researcher",
  },
  "web-reviewer": {
    "id": "web-reviewer",
    "title": "Web Reviewer Agent",
    "description": "Reviews UI component code ONLY (*.tsx/*.jsx with JSX) - components, hooks, props, state, performance, a11y patterns - NOT for API routes, configs, or server code (use api-reviewer)",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/web-reviewer",
  },
  "web-tester": {
    "id": "web-tester",
    "title": "Web Tester Agent",
    "description": "Writes tests BEFORE implementation - all test types (*.test.*, *.spec.*, E2E) - Tester red-green-refactor - invoke BEFORE developer implements feature",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "tester",
    "path": "tester/web-tester",
  },
} as const satisfies Record<AgentName, GeneratedAgentDefinition>
