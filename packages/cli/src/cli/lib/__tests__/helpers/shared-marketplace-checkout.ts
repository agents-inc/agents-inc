import { mkdir, rename, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { downloadTemplate } from "giget";

import { DEFAULT_PLUGIN_NAME } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { directoryExists } from "../test-fs-utils.js";

/**
 * The one checkout of the DEFAULT public marketplace every isolated home borrows, built once
 * per machine and never revalidated.
 *
 * ## What it is for
 *
 * `setupIsolatedHome` gives each test a throwaway HOME, and `cacheRoot()` is
 * `os.homedir()/.cache/<DEFAULT_PLUGIN_NAME>` — so before this existed, every test that let a
 * command fall through to the default marketplace found an EMPTY cache and downloaded the whole
 * of `agents-inc/skills` from GitHub, extracted it, and read it back. Measured on 2026-09-02
 * over the `commands` project: 21 tarball downloads in `doctor.test.ts` alone (one per test that
 * reached the default source), 8 in `eject.test.ts`, and ~2.5s of gunzip-and-write per
 * invocation on an idle 20-core machine.
 *
 * That cost is what made the project fail on machine speed rather than on code (CLI-853). The
 * network round trip is the small half — ~210ms — and the extract is the rest, which is CPU and
 * IO bound and therefore stretches with load: under manufactured 20-way contention the same
 * tests ran 9-22s against a 10s budget.
 *
 * ## Why sharing it is not a loss of isolation
 *
 * What these tests isolate is `~/.claude/` — the skills and agents an install writes. The
 * marketplace cache is neither written by the subject nor asserted on: it is a content-addressed,
 * read-only checkout of a PUBLIC repository, identical for every test that reads it. Giving each
 * test its own empty copy bought nothing and cost a download.
 *
 * This is `shared-source.ts` applied one directory over, and for the same reason it gives: one
 * build, shared, instead of the same build at every call site. It needs no `chmod -R a-w` freeze
 * because nothing in the suite writes here — the commands under test copy OUT of a checkout and
 * INTO a project.
 *
 * ## Why nothing revalidates it
 *
 * The record written beside the copy carries a `tar` with NO `etag`, which is the one shape
 * `classifyCachedCopy` answers `current` to without asking the network anything — the same trick,
 * and the same import of `fetchRecordPath` rather than a spelled path, as
 * `e2e/fixtures/default-source-cache.ts`. Without it every file's first invocation would spend a
 * HEAD on `api.github.com`, and an unreachable one costs `REVALIDATION_TIMEOUT_MS` (5s) before
 * the cached copy is used — which is the flake back again, wearing a different number.
 *
 * A frozen fixture is also the point rather than a compromise: a suite whose fixture changes when
 * a third-party repository changes is less deterministic, not more.
 *
 * ## Why a fixed path, and why publishing it is a rename
 *
 * `globalSetup` runs in vitest's own process and the specs run in forked workers, so the location
 * has to be something both can compute without passing it — `shared-source.ts` documents the same
 * constraint, and states the rule a machine-wide path costs, which this module is the second
 * member of. Where that module is idempotent by REMOVAL, this one is idempotent by DETECTION,
 * because rebuilding costs a download rather than 1.65s of local work. Detection is only safe if
 * a half-built tree can never be mistaken for a finished one, so the download lands in a sibling
 * directory and is `rename`d into place — an atomic publish, after which the directory's presence
 * means the DOWNLOAD is complete.
 *
 * ## Why the record is written on every call and not only after a download
 *
 * The directory's presence does not mean the CHECKOUT is complete, and this docblock claimed it
 * did until 2026-09-02. A checkout is a directory plus the record beside it, the record is a
 * SIBLING path ({@link fetchRecordPath} is `${cacheDir}.etag.json`), and a `rename` moves one
 * path — so a run killed between the two published a directory the guard accepts and a record
 * `classifyCachedCopy` answers `unrecorded` to. Nothing repaired it: every later run returned
 * early over the directory and every worker in it re-downloaded the whole marketplace, so one
 * interrupted setup restored the 31-downloads-per-run defect permanently, in silence.
 *
 * Writing the record UNCONDITIONALLY is what closes that, and it is the cheaper half of the fix
 * to be sure of: a published checkout is complete by construction, so the repair is one small
 * write and never a fetch. Ordering the write ahead of the `rename` closes the same window and
 * was the fix first proposed; it was not taken, because the only thing that separates it from
 * the defect is the order of two statements inside one function, and no assertion can see that
 * without mocking `fs/promises` — a fix nothing can catch the reversal of, which is the
 * complaint `isolated-home.test.ts`'s checkout pins exist to answer one module over. This shape
 * also survives losing the record any other way, which the ordering does not: a `/tmp` reaper
 * deletes files, and the record is one small file beside a large directory.
 *
 * The directory name spells neither "source" nor "marketplace", for the reason `shared-source.ts`
 * gives at length: specs assert the CLI's user-facing prose has withdrawn both nouns, and a
 * negative running over a whole message cannot tell the product's wording from a fixture's path.
 */
const SHARED_CACHE_HOME = path.join(os.tmpdir(), "agents-inc-unit-shared-cache");

/** The `.cache` directory an isolated home borrows in place of its own. */
function cacheDirUnder(cacheHome: string): string {
  return path.join(cacheHome, ".cache");
}

/**
 * Where `fetchFromRemoteSource` looks for the default marketplace once HOME is the fake one.
 *
 * Assembled from the product's own `sanitizeSourceForCache` rather than spelled, so the two
 * surfaces cannot drift about the address: a checkout written anywhere else is invisible to the
 * fetcher and is silently re-downloaded, which is the one failure this module exists to prevent.
 */
function defaultCheckoutDir(cacheHome: string): string {
  return path.join(
    cacheDirUnder(cacheHome),
    DEFAULT_PLUGIN_NAME,
    "sources",
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );
}

/** Where a download lands before it is published, so a killed run leaves nothing usable behind. */
function stagingCheckoutDir(cacheHome: string): string {
  return `${defaultCheckoutDir(cacheHome)}.staging`;
}

/**
 * The tarball the record names. Deliberately unreachable: with no `etag` beside it nothing ever
 * asks, and a URL that resolves would be an invitation for something to start.
 */
const NEVER_REVALIDATED_TARBALL = `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz`;

/**
 * Ensures the shared checkout exists. Called once, from `globalSetup`, before any worker starts —
 * which is what makes the download race-free without a lock.
 *
 * Downloading through giget directly rather than through `fetchFromSource` is not a second
 * implementation of the address: that function resolves its directory from `os.homedir()`, and
 * `os.homedir()` under bun is fixed at startup and ignores `process.env.HOME` — so a setup that
 * pointed HOME at the shared home and called it would seed the DEVELOPER'S OWN cache under
 * `bun run test` and nobody's under `npm test`. The address stays single-sourced through
 * {@link defaultCheckoutDir}; only the fetch is made directly.
 */
export async function ensureSharedMarketplaceCheckout(): Promise<void> {
  await ensureRecordedCheckout(SHARED_CACHE_HOME, downloadDefaultMarketplace);
}

/** The one fetch this module makes, named so the mechanism below can be driven without it. */
async function downloadDefaultMarketplace(dir: string): Promise<void> {
  await downloadTemplate(DEFAULT_SOURCE, { dir, force: true, offline: false });
}

/**
 * The mechanism {@link ensureSharedMarketplaceCheckout} is the shared-path call site of: publish a
 * checkout under `cacheHome` and record it, fetching only when there is nothing published yet.
 *
 * Both the root and the fetch are parameters so that this module's spec can drive the whole thing
 * at a root it owns and without a download — see the rule in `shared-source.ts`, which is what the
 * root parameter is for, and which this module is the second member of.
 */
export async function ensureRecordedCheckout(
  cacheHome: string,
  fetchInto: (dir: string) => Promise<void>,
): Promise<void> {
  if (!(await directoryExists(defaultCheckoutDir(cacheHome)))) {
    await publishCheckout(cacheHome, fetchInto);
  }

  await recordCheckout(defaultCheckoutDir(cacheHome));
}

/**
 * Fetches a checkout and publishes it in one atomic step, so no reader can find a half-built one:
 * the fetch lands in a sibling directory and the `rename` is what makes it visible at the address.
 */
async function publishCheckout(
  cacheHome: string,
  fetchInto: (dir: string) => Promise<void>,
): Promise<void> {
  const staging = stagingCheckoutDir(cacheHome);
  await rm(staging, { recursive: true, force: true });
  await mkdir(path.dirname(staging), { recursive: true });

  await fetchInto(staging);
  await rename(staging, defaultCheckoutDir(cacheHome));
}

/**
 * Writes the record that keeps every worker offline. A separate act from publishing, and named as
 * one, because it is what the caller above does on EVERY call — see the docblock at the top for
 * the interruption that makes an unconditional write the point rather than a redundancy.
 */
async function recordCheckout(checkout: string): Promise<void> {
  await writeFile(fetchRecordPath(checkout), JSON.stringify({ tar: NEVER_REVALIDATED_TARBALL }));
}

/**
 * Points a fake home's `.cache` at the shared one, so a command run under it finds the checkout
 * already there.
 *
 * A symlink rather than a copy, and at `.cache` rather than one level deeper, so giget's own
 * tarball cache at `<home>/.cache/giget` is shared by the same link. `fs.rm` does not follow
 * symlinks, so the teardown that removes a fake home unlinks this and leaves the checkout
 * standing — which is what lets every later test in the run still read it.
 */
export async function linkSharedCache(fakeHome: string): Promise<void> {
  await symlink(cacheDirUnder(SHARED_CACHE_HOME), path.join(fakeHome, ".cache"), "dir");
}
