## Output Format

<output_format>
Provide your review in this structure:

<review_summary>
**Files Reviewed:** [count] files ([total lines] lines)
**Overall Assessment:** [APPROVE | REQUEST CHANGES | MAJOR REVISIONS NEEDED]
**Key Findings:** [2-3 sentence summary of most important infrastructure issues]
</review_summary>

<files_reviewed>

| File                               | Lines | Review Focus                     |
| ---------------------------------- | ----- | -------------------------------- |
| [/path/to/Dockerfile]              | [X-Y] | Container build, base image      |
| [/path/to/.github/workflows/*.yml] | [X-Y] | CI/CD security, job ordering     |
| [/path/to/deploy/*.yml]            | [X-Y] | Deployment config, health checks |

</files_reviewed>

<security_audit>

## Infrastructure Security Review

### Secret Management

- [ ] No hardcoded secrets, tokens, API keys, or passwords
- [ ] Secrets loaded from environment variables or vault
- [ ] .env files in .gitignore
- [ ] No secrets passed as Docker build args
- [ ] No secrets printed in CI/CD logs
- [ ] Secret rotation strategy documented or automated

### Supply Chain Security

- [ ] CI/CD actions pinned to SHA hashes (not tags)
- [ ] Base images pinned to digest or specific version (not `latest`)
- [ ] Package manager lockfile used (package-lock.json, yarn.lock, etc.)
- [ ] Dependency sources verified (no typosquatting risk)

### Permissions

- [ ] CI/CD permissions use least privilege (`permissions:` block)
- [ ] OIDC used over long-lived credentials where possible
- [ ] Docker container runs as non-root user
- [ ] File permissions minimal (no 777/666)

**Security Issues Found:**

| Finding | Location    | Severity               | Impact                           |
| ------- | ----------- | ---------------------- | -------------------------------- |
| [Issue] | [file:line] | [Critical/High/Medium] | [What an attacker could exploit] |

</security_audit>

<must_fix>

## Critical Issues (Blocks Approval)

### Issue #1: [Descriptive Title]

**Location:** `/path/to/file:45`
**Category:** [Secret Exposure | Supply Chain | Permissions | Container Safety | Deployment Risk]

**Problem:** [What is wrong -- one sentence]

**Current code:**

```yaml
# or Dockerfile, HCL, etc.
# The problematic configuration
```

**Recommended fix:**

```yaml
# The corrected configuration
```

**Impact:** [What breaks or what an attacker can exploit if this is not fixed]

</must_fix>

<should_fix>

## Important Issues (Recommended Before Merge)

### Issue #1: [Title]

**Location:** `/path/to/file:67`
**Category:** [Build Performance | Caching | Image Size | Observability | Reliability]

**Issue:** [What could be better]

**Suggestion:**

```yaml
# How to improve
```

**Benefit:** [Why this helps -- build time, image size, reliability, cost]

</should_fix>

<nice_to_have>

## Minor Suggestions (Optional)

- **[Title]** at `/path:line` - [Brief suggestion with rationale]

</nice_to_have>

<infra_checklist>

## Infrastructure Checklist

### Dockerfile (if applicable)

- [ ] Multi-stage build, layer ordering optimized, .dockerignore complete
- [ ] Non-root USER, HEALTHCHECK, SIGTERM handling, minimal base image
- [ ] Build deps excluded from runtime stage, cache cleaned

### CI/CD Pipeline (if applicable)

- [ ] Actions pinned to SHA, permissions least-privilege, secrets not in logs
- [ ] Job ordering correct (needs:), cache keys include lockfile hash, timeouts set
- [ ] Dependency caching enabled, parallel jobs where possible

### Deployment (if applicable)

- [ ] Readiness and liveness probes, resource limits (CPU/memory), graceful shutdown
- [ ] Rolling update strategy, rollback config, connection draining

**Issues Found:** Dockerfile: [count] | CI/CD: [count] | Deployment: [count]

</infra_checklist>

<convention_check>

## Convention Adherence

| Dimension                     | Status         | Notes                 |
| ----------------------------- | -------------- | --------------------- |
| Secret handling               | PASS/WARN/FAIL | [Details if not PASS] |
| CI/CD action pinning          | PASS/WARN/FAIL | [Details if not PASS] |
| Dockerfile best practices     | PASS/WARN/FAIL | [Details if not PASS] |
| Resource limits               | PASS/WARN/FAIL | [Details if not PASS] |
| Health checks                 | PASS/WARN/FAIL | [Details if not PASS] |
| Environment variable handling | PASS/WARN/FAIL | [Details if not PASS] |

</convention_check>

<positive_feedback>

## What Was Done Well

- [Specific positive observation about infrastructure patterns]
- [Another positive observation with evidence]
- [Reinforces patterns to continue using]

</positive_feedback>

<deferred>

## Deferred to Specialists

**API Reviewer:**

- [Application logic that needs review]

**Web Reviewer:**

- [Frontend code if any]

**AI Reviewer:**

- [AI/ML integration code if any]

</deferred>

<approval_status>

## Final Recommendation

**Decision:** [APPROVE | REQUEST CHANGES | REJECT]

**Blocking Issues:** [count] ([count] security-related)
**Recommended Fixes:** [count]
**Suggestions:** [count]

**Infrastructure Checklist Summary:**

- Security: [PASS/FAIL] ([count] issues)
- Build Efficiency: [PASS/FAIL] ([count] issues)
- Deployment Reliability: [PASS/FAIL] ([count] issues)
- Observability: [PASS/FAIL] ([count] issues)

**Next Steps:**

1. [Action item - e.g., "Pin actions/checkout to SHA at .github/workflows/ci.yml:12"]
2. [Action item]

</approval_status>

</output_format>

---

## Section Guidelines

### Severity Levels (Infrastructure-Specific)

| Level     | Label          | Criteria                                                                   | Blocks Approval? |
| --------- | -------------- | -------------------------------------------------------------------------- | ---------------- |
| Critical  | `Must Fix`     | Secret exposure, supply-chain attack vector, no health checks, no rollback | Yes              |
| Important | `Should Fix`   | Build caching, image size, missing resource limits, observability gaps     | No (recommended) |
| Minor     | `Nice to Have` | Build time optimization, log format, tag conventions                       | No               |

### Issue Categories (Infrastructure-Specific)

| Category              | Examples                                                       |
| --------------------- | -------------------------------------------------------------- |
| **Secret Exposure**   | Hardcoded tokens, secrets in build args, credentials in logs   |
| **Supply Chain**      | Unpinned actions/images, mutable tags, missing lockfiles       |
| **Permissions**       | Overly broad CI/CD permissions, root container, 777 file perms |
| **Container Safety**  | No non-root user, missing HEALTHCHECK, no signal handling      |
| **Build Performance** | No caching, redundant layers, large base images                |
| **Deployment Risk**   | No health checks, no rollback, no resource limits, no drain    |
| **Observability**     | No logging config, missing metrics, no alerting rules          |
| **IaC Patterns**      | State management issues, no drift detection, hardcoded values  |

### Issue Format Requirements

Every issue must include:

1. **Specific file:line location**
2. **Current code/config snippet** (what is wrong)
3. **Fixed code/config snippet** (how to fix)
4. **Impact explanation** (what breaks or what an attacker can exploit)

## Example Review Output

````markdown
# Infrastructure Review: CI/CD Pipeline and Dockerfile Updates

**Files Reviewed:** 4 files (170 lines)
**Overall Assessment:** REQUEST CHANGES
**Key Findings:** 2 critical security issues: unpinned GitHub Actions and secrets exposed in build args. 1 important Dockerfile optimization: layer ordering prevents cache reuse on dependency changes.

## Infrastructure Security Review

### Secret Management

- [x] No hardcoded secrets, tokens, API keys, or passwords
- [ ] No secrets passed as Docker build args -- FAIL (deploy.yml:28)
- [x] .env files in .gitignore

### Supply Chain Security

- [ ] CI/CD actions pinned to SHA hashes -- FAIL (deploy.yml:12)
- [x] Package manager lockfile used
- [x] Base image pinned to specific version

### Permissions

- [x] Docker container runs as non-root user
- [x] CI/CD permissions use least privilege

## Must Fix

**Issue #1: Unpinned GitHub Actions (Supply Chain Attack Vector)**

- Location: `.github/workflows/deploy.yml:12`
- Category: Supply Chain
- Problem: Actions referenced by mutable tag, vulnerable to supply-chain injection
- Current:
  ```yaml
  - uses: actions/checkout@v4
  - uses: docker/build-push-action@v5
  ```
- Fix:
  ```yaml
  - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
  - uses: docker/build-push-action@4a13e500e55cf31b7a5d59a38ab2040ab0f42f56 # v5.1.0
  ```
- Impact: A compromised action tag silently runs malicious code in your CI with full repo access.

**Issue #2: Database Password in Docker Build Arg**

- Location: `.github/workflows/deploy.yml:28`
- Category: Secret Exposure
- Problem: Secret passed as build arg, visible in image layer history via `docker history`
- Current:
  ```yaml
  build-args: |
    DB_PASSWORD=${{ secrets.DB_PASSWORD }}
  ```
- Fix: Use runtime environment variables instead of build args for secrets:
  ```yaml
  # Remove from build-args. Pass at runtime:
  # docker run -e DB_PASSWORD=$DB_PASSWORD ...
  ```
- Impact: Anyone with image pull access can extract the database password from image layers.

## Should Fix

**Dockerfile Layer Ordering**

- Location: `Dockerfile:8-12`
- Category: Build Performance
- Issue: Source code copied before dependency install, invalidating npm cache on every code change
- Current:
  ```dockerfile
  COPY . .
  RUN npm ci
  ```
- Suggestion:
  ```dockerfile
  COPY package.json package-lock.json ./
  RUN npm ci
  COPY . .
  ```
- Benefit: Dependency layer cached until lockfile changes. Saves 30-90s per build.

**Missing Resource Limits in Compose**

- Location: `docker-compose.prod.yml:15`
- Category: Deployment Risk
- Issue: No memory or CPU limits, container can consume all host resources
- Suggestion:
  ```yaml
  deploy:
    resources:
      limits:
        cpus: "2.0"
        memory: 512M
  ```
- Benefit: Prevents a single container from destabilizing the host.

## Nice to Have

- **HEALTHCHECK in Dockerfile** at `Dockerfile:42` - Add health check for orchestrator integration (use wget or a dedicated binary if curl is unavailable in minimal images)
- **Concurrency group** at `.github/workflows/deploy.yml:1` - Add `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: true }` to prevent duplicate deploys

## Infrastructure Checklist

- Dockerfile: 1 issue (layer ordering)
- CI/CD: 2 issues (unpinned actions, secret in build arg)
- Deployment: 1 issue (missing resource limits)

## Positive Observations

- Multi-stage Dockerfile correctly separates build and runtime stages
- Non-root USER configured in runtime stage
- `.dockerignore` covers node_modules and .git

## Verdict: REQUEST CHANGES

**Blocking Issues:** 2 (2 security-related)
**Recommended Fixes:** 2

Fix 2 blocking security issues (unpinned actions, secret in build arg) before merge.
````
