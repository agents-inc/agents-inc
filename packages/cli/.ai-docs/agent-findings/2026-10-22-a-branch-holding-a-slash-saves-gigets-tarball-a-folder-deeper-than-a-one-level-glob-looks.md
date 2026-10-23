---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/e2e/commands/doctor-marketplace-download.e2e.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `GIGET_TARBALLS` in `source-fetcher.ts` lists giget's tarballs at any depth (`**/*.tar.gz`). A
  unit describe and the doctor e2e scenario now use a branch holding a slash; both were red before
  the change.
---

## What Was Wrong

`gigetDownload` tells giget's saved tarball apart from a fresh download by listing every tarball's
modification time before the download. The listing used `*/*.tar.gz` under giget's provider
directory, one folder per template.

giget saves a tarball as `{name}/{version || name}.tar.gz`. For a git provider, `version` is the ref
after `#`, and both giget's `parseGitURI` (`[\w./@-]+`) and the CLI's `validateGitShorthand` accept
a slash in it. So `github:org/repo#feature/x` is saved as `github/org-repo/feature/x.tar.gz`, one
folder deeper than the listing looked. The tarball read as absent before the download and present
after it, so giget's saved copy after a failed download passed as a fresh download:

- doctor printed `✓ … 10 skills available / Reached … over the network` while the marketplace
  served 9;
- a load outside doctor recorded the marketplace's new ETag over the saved content.

Nothing could see it. The unit stubs used version `main`. The e2e spec used an http source, whose
template has no version, so its tarball is always one folder down.

## Fix Applied

- `GIGET_TARBALLS` is `**/*.tar.gz`.
- `source-fetcher-revalidation.test.ts`, "a marketplace named by a branch whose name holds a
  slash": the recorded ETag outside doctor and the refusal inside it were red before the change.
  The third spec, a download that rewrote the tarball, is the allowed case beside the refusal.
- `doctor-marketplace-download.e2e.test.ts` runs its doctor scenario over a second marketplace,
  `github:org/repo#feature/x`, with `GIGET_GITHUB_URL` pointed at the tarball server. Its three
  specs were red before the change. The scenario outside doctor stays on the URL: a load outside
  doctor discards a superseded copy of a git source together with giget's tarball of it.

One case the listing still does not cover. giget resolves the tarball with
`resolve(templateDir, version + ".tar.gz")`. `validateRemoteSource` refuses `..`, but it accepts a
ref starting with `/` (`github:org/repo#/x`), which giget resolves to the filesystem root. The CLI
locates it with `path.join` inside the template folder, finds nothing there and treats the tarball
as saved: doctor refuses the download, and a load outside doctor records it with no ETag. This is
traced through the code, not run. A user who cannot write to `/` gets a failed download either way.

## Proposed Standard

For `clean-code-standards.md`, extending the proposal in
`2026-10-22-an-answer-after-a-giget-download-cannot-show-the-marketplace-served-what-giget-extracted`:
**where the CLI copies a library's on-disk layout, assume every path segment taken from user input
(a ref, a version, a name) can hold the separator.** Read that layout at any depth, or compute the
path the library computes, never with a fixed-depth pattern. A test of such a copy includes one
input that holds the separator.

Census of fixed-depth globs in the CLI:

```
grep -rnE "glob\(|fg\(" packages/cli/src --include='*.ts' --include='*.tsx' | grep -v test
```

On 2026-10-22 the only other fixed-depth pattern it returned was `*/config.yaml` in
`source-validator.ts`. That pattern reads a marketplace's stack folders, which are directory names
and cannot hold a slash. Nothing in `CLAUDE.md` contradicts the proposal. It was not checked against
every standard.
