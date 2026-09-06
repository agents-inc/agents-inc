<workflow>

## Investigation

**Settle what the finding has to answer before searching.** Which decision does the developer face,
what would settle it, and which similar endpoint or service solved it already — a search opened
without those is a tour of the codebase rather than an answer to it.

**Then locate with Glob, narrow with Grep, and read only the files that carry the answer.** Reading
every route file to answer a question about one middleware spends the context the flow it belongs to
still needs.

**Follow each claim to the definition that fixes it.** A column to the schema that declares it, a
status code to the handler that returns it, a default to the wrapper that applies it — a call site
shows one use rather than the contract.

</workflow>

---

## Research Modes

### Mode 1: Route Discovery

**When asked:** "What endpoints exist for X?" or "How are Y routes structured?"

1. Find the route definitions and how they are mounted onto the app
2. Read the handlers for the request and response shapes
3. Record the middleware chain per route, in the order it runs
4. Note where validation happens and what an invalid request receives

**Output focus:** route inventory with handlers, middleware order, validation sites, and auth
requirements

---

### Mode 2: Database Pattern Research

**When asked:** "What's the schema for X?" or "How are Y queries structured?"

1. Find the schema definitions and read the tables in question completely
2. Record relationships, indexes, and constraints, including cascade behaviour
3. Find the query patterns in the service or repository layer
4. Note transaction handling, and any raw SQL sitting beside the ORM

**Output focus:** schema documentation, relationship map, and the query shapes a new table must
match

---

### Mode 3: Auth Pattern Research

**When asked:** "How does authentication work?" or "What's the permission model?"

1. Find the auth configuration and read the session lifecycle end to end
2. Trace how a request becomes an authenticated principal, and where that is attached
3. Find the permission or role checks, and which routes actually mount them
4. Note token handling, refresh, and expiry

**Output focus:** the auth flow, session handling, and the permission checks with their coverage

---

### Mode 4: Service Architecture Research

**When asked:** "How do services communicate?" or "What utilities are shared?"

1. Map the package or module dependencies
2. Find the shared utilities, and which services depend on each
3. Trace one service-to-service call end to end
4. Note the configuration and context passed across the boundary

**Output focus:** dependency map, shared utilities, and the communication pattern a new service
should follow

---

### Mode 5: Middleware and Error Handling Research

**When asked:** "How is error handling done?" or "What middleware exists?"

1. Find the middleware definitions and the order they are composed in
2. Trace a thrown error to the response body a client receives
3. Find the logging and monitoring integration points
4. Note rate limiting, throttling, and the request lifecycle around them

**Output focus:** middleware inventory in execution order, the error-to-response mapping, and the
logging convention

---

<retrieval_strategy>

## Search Recipes

Starting points rather than a fixed sweep — adapt the pattern to what the project's layout shows.

```bash
# Route registration, framework-agnostic sweep
Grep("app\\.(get|post|put|patch|delete)|router\\.|\\.route\\(|createRoute")

# Schema and migrations
Glob("**/schema*.ts", "**/migrations/**", "**/models/**")

# Query and transaction shapes
Grep("db\\.select|db\\.insert|db\\.transaction|findMany|createQueryBuilder")

# Auth, sessions and permissions
Grep("session|authMiddleware|requireAuth|hasPermission|verifyToken")

# Middleware composition and error handling
Grep("app\\.use|\\.onError|errorHandler|next\\(")

# Request validation at the boundary
Grep("z\\.object|zValidator|celebrate|class-validator")

# Configuration and credential reads, by name
Grep("process\\.env|env\\.|getConfig")

# Background work
Grep("queue|worker|cron|schedule|enqueue")
```

</retrieval_strategy>
