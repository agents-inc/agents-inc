import path from "path";
import { z } from "zod";

import { PROJECT_ROOT, STANDARD_FILES } from "../../consts";
import { readFile } from "../../utils/fs";

/** The one field the marker needs from this CLI's own manifest. */
const ownPackageJsonSchema = z.object({ version: z.string().min(1) });

/**
 * The provenance marker every compiled agent carries lives in `@workspace/compile/agent-source`,
 * beside the renderer that stamps it — the editor's output preview draws the same first body line
 * and must not compute it a second way. What stays here is the half that reads this CLI's own
 * manifest, which a browser has no equivalent of.
 */
export {
  hasProvenanceMarker,
  provenanceMarker,
  stampProvenanceMarker,
} from "@workspace/compile/agent-source";

let ownVersion: Promise<string> | undefined;

/**
 * This CLI's own published version, read once per process from the package manifest beside
 * the code — the same `PROJECT_ROOT` the bundled agent partials and templates resolve from.
 *
 * It reaches a compiled agent as the `version` argument of `renderAgent`, which hands it to the
 * template as `generatorVersion`; `agent.liquid` renders it in the trailing `<system-reminder>`
 * block. Deliberately not the provenance marker above it — that line's bytes are constant across
 * releases, so a version bump no longer rewrites the first cacheable byte of every compiled agent.
 */
export function cliVersion(): Promise<string> {
  ownVersion ??= readOwnVersion();
  return ownVersion;
}

async function readOwnVersion(): Promise<string> {
  const manifestPath = path.join(PROJECT_ROOT, STANDARD_FILES.PACKAGE_JSON);
  const raw: unknown = JSON.parse(await readFile(manifestPath));

  const parsed = ownPackageJsonSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Could not read this CLI's own version from ${manifestPath}`);
  }
  return parsed.data.version;
}
