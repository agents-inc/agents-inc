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
  "ai-researcher": {
    "id": "ai-researcher",
    "title": "AI Researcher Agent",
    "description": "Read-only AI codebase research specialist - discovers prompt templates and prompt-assembly code, catalogs model and provider SDK usage, maps RAG and embedding pipelines and vector stores, documents tool-calling schemas and agentic loops, finds eval setups, token budgeting, streaming and caching patterns - produces structured findings for ai-developer and the pm - invoke for AI research before implementation",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "researcher",
    "path": "researcher/ai-researcher",
  },
  "ai-tester": {
    "id": "ai-tester",
    "title": "AI Tester Agent",
    "description": "Tests AI features - mocks LLM and provider calls at deterministic seams, unit-tests prompt assembly and context construction, validates tool-call and structured-output schemas, covers retry/fallback/rate-limit/streaming paths, asserts token and cost budgets, writes prompt regression snapshots, and builds eval harnesses with golden datasets kept out of CI - invoke BEFORE or AFTER ai-developer implements features",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "tester",
    "path": "tester/ai-tester",
  },
  "api-developer": {
    "id": "api-developer",
    "title": "API Developer Agent",
    "description": "Implements backend features from detailed specs - API routes, database operations, server utilities, authentication, middleware - surgical execution following existing patterns - invoke AFTER the pm creates the spec",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/api-developer",
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
  "cli-researcher": {
    "id": "cli-researcher",
    "title": "CLI Researcher Agent",
    "description": "Read-only CLI research specialist - discovers command registration and structure patterns, catalogs interactive prompt and TUI component conventions, understands flag parsing and config hierarchies, maps exit-code, error-handling and output-formatting conventions, finds testing seams - produces structured findings for cli-developer and the pm - invoke for CLI research before implementation",
    "model": "opus",
    "tools": ["Read","Grep","Glob","Bash"],
    "flavor": "researcher",
    "path": "researcher/cli-researcher",
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
  "pm": {
    "id": "pm",
    "title": "PM and Architect Agent",
    "description": "Creates implementation specs for any feature - frontend, backend, CLI, and AI alike - by researching the codebase's real patterns and naming the ones to follow, with fenced scope and verifiable success criteria; domain planning frameworks arrive via meta-planning skills - invoke BEFORE a developer for any new feature",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "planning",
    "path": "planning/pm",
  },
  "reviewer": {
    "id": "reviewer",
    "title": "Reviewer Agent",
    "description": "Reviews any diff - web, API, CLI, AI, and infrastructure code alike - one severity-disciplined quality gate for correctness, security, and convention adherence; domain-specific checklists arrive via meta-reviewing skills",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "reviewer",
    "path": "reviewer/reviewer",
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
  "web-developer": {
    "id": "web-developer",
    "title": "Web Developer Agent",
    "description": "Implements frontend features from detailed specs - UI components, TypeScript, styling, client state - surgical execution following existing patterns - invoke AFTER the pm creates the spec",
    "model": "opus",
    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],
    "flavor": "developer",
    "path": "developer/web-developer",
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
