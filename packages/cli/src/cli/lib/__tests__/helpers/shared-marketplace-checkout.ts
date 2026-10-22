import { mkdir, rename, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { downloadTemplate } from "giget";

import { DEFAULT_PLUGIN_NAME } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { directoryExists } from "../test-fs-utils.js";

/**
 * One machine-wide checkout of the default marketplace that every isolated home links to, so
 * tests don't each download it. Published by rename (presence means the download finished); the
 * etag-less record is rewritten every call, keeping it offline and repairing an interrupted run.
 * The name avoids "source"/"marketplace", which specs assert user-facing prose never contains.
 */
const SHARED_CACHE_HOME = path.join(os.tmpdir(), "agents-inc-unit-shared-cache");

function cacheDirUnder(cacheHome: string): string {
  return path.join(cacheHome, ".cache");
}

// Built with the product's sanitizeSourceForCache so it matches where the fetcher looks.
function defaultCheckoutDir(cacheHome: string): string {
  return path.join(
    cacheDirUnder(cacheHome),
    DEFAULT_PLUGIN_NAME,
    "sources",
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );
}

function stagingCheckoutDir(cacheHome: string): string {
  return `${defaultCheckoutDir(cacheHome)}.staging`;
}

// Deliberately unreachable: with no etag nothing revalidates it.
const NEVER_REVALIDATED_TARBALL = `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz`;

/**
 * Called once from globalSetup before workers start, so no lock is needed. Uses giget directly:
 * fetchFromSource reads os.homedir(), which bun fixes at startup regardless of HOME.
 */
export async function ensureSharedMarketplaceCheckout(): Promise<void> {
  await ensureRecordedCheckout(SHARED_CACHE_HOME, downloadDefaultMarketplace);
}

async function downloadDefaultMarketplace(dir: string): Promise<void> {
  await downloadTemplate(DEFAULT_SOURCE, { dir, force: true, offline: false });
}

/** Root and fetch are parameters so the spec can drive this at its own root without a download. */
export async function ensureRecordedCheckout(
  cacheHome: string,
  fetchInto: (dir: string) => Promise<void>,
): Promise<void> {
  if (!(await directoryExists(defaultCheckoutDir(cacheHome)))) {
    await publishCheckout(cacheHome, fetchInto);
  }

  await recordCheckout(defaultCheckoutDir(cacheHome));
}

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

async function recordCheckout(checkout: string): Promise<void> {
  await writeFile(fetchRecordPath(checkout), JSON.stringify({ tar: NEVER_REVALIDATED_TARBALL }));
}

// Linked at `.cache` so giget's tarball cache is shared too; fs.rm on the home only unlinks it.
export async function linkSharedCache(fakeHome: string): Promise<void> {
  await symlink(cacheDirUnder(SHARED_CACHE_HOME), path.join(fakeHome, ".cache"), "dir");
}

/** Recorded by `fingerprintSharedCheckout`; a spec's stubbed `fetch` answers with it. */
export const SHARED_CHECKOUT_ETAG = 'W/"shared-checkout"';

/**
 * For `doctor`, which downloads over a copy no ETag vouches for: swaps the linked `.cache` for the
 * home's own, whose default-marketplace copy links the shared checkout under a record carrying
 * `SHARED_CHECKOUT_ETAG`, so a download never lands in the shared one. `rm` only unlinks.
 */
export async function fingerprintSharedCheckout(fakeHome: string): Promise<void> {
  await rm(cacheDirUnder(fakeHome), { force: true });

  const checkout = defaultCheckoutDir(fakeHome);
  await mkdir(path.dirname(checkout), { recursive: true });
  await symlink(defaultCheckoutDir(SHARED_CACHE_HOME), checkout, "dir");
  await writeFile(
    fetchRecordPath(checkout),
    JSON.stringify({ tar: NEVER_REVALIDATED_TARBALL, etag: SHARED_CHECKOUT_ETAG }),
  );
}
