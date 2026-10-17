import path from "path";
import { z } from "zod";

import { PROJECT_ROOT, STANDARD_FILES } from "../../consts";
import { readFile } from "../../utils/fs";

const ownPackageJsonSchema = z.object({ version: z.string().min(1) });

export {
  hasProvenanceMarker,
  provenanceMarker,
  stampProvenanceMarker,
} from "@workspace/compile/agent-source";

let ownVersion: Promise<string> | undefined;

/**
 * Rendered in the trailing `<system-reminder>`, not the provenance marker, so a version bump leaves
 * the first cacheable bytes of every compiled agent unchanged.
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
