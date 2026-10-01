import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderAgentRoleToml } from "@workspace/compile/agent-source";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMockAgentConfig } from "../__tests__/factories/agent-factories";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import { agentCodec } from "../installation/install-layout";
import { provenanceMarker } from "./agent-provenance";
import { pruneStaleCompiledAgents, splitAgentsByProvenance } from "./list-compiled-agents";
import type { AgentName } from "../../types";

/**
 * The compiled-agent readers on Codex, where an agent is a `.toml` role and its marker sits inside
 * `developer_instructions` rather than under a frontmatter fence.
 *
 * CLI-896, found by Codex running the end-to-end check itself 2026-09-26: these readers globbed
 * `*.md` and read Claude's marker, so on Codex they found no compiled agent at all — `uninstall`
 * left every role in place while saying it had removed them, and compile's prune left a
 * deselected role for Codex to keep offering.
 */

const CODEX = agentCodec("codex");
const COMPILED: AgentName = "web-developer";
const DESELECTED: AgentName = "cli-developer";

/** A role the user wrote: no marker, and a name that is not one of this CLI's agents. */
const THEIR_OWN_ROLE = "their-own-role";

let agentsDir: string;

beforeEach(async () => {
  agentsDir = await createTempDir();
});

afterEach(async () => {
  await cleanupTempDir(agentsDir);
});

/** A role file exactly as the Codex compile writes it, marker first in `developer_instructions`. */
async function writeCompiledRole(name: string): Promise<void> {
  const role = renderAgentRoleToml(
    createMockAgentConfig(name),
    `${provenanceMarker()}\n\n# ${name}\n\nbody`,
  );
  await writeFile(path.join(agentsDir, `${name}.toml`), role, "utf-8");
}

async function writeUnmarkedRole(name: string): Promise<void> {
  const role = renderAgentRoleToml(createMockAgentConfig(name), `# ${name}\n\nbody`);
  await writeFile(path.join(agentsDir, `${name}.toml`), role, "utf-8");
}

describe("reading a Codex agents directory", () => {
  it("splits the roles this CLI compiled from the ones the user wrote", async () => {
    await writeCompiledRole(COMPILED);
    await writeUnmarkedRole(THEIR_OWN_ROLE);

    expect(await splitAgentsByProvenance(agentsDir, CODEX)).toStrictEqual({
      marked: [COMPILED],
      unmarked: [THEIR_OWN_ROLE],
    });
  });

  it("prunes a deselected compiled role and keeps the kept one and the user's own", async () => {
    await writeCompiledRole(COMPILED);
    await writeCompiledRole(DESELECTED);
    await writeUnmarkedRole(THEIR_OWN_ROLE);

    await pruneStaleCompiledAgents(agentsDir, new Set([COMPILED]), CODEX);

    expect((await readdir(agentsDir)).sort()).toStrictEqual(
      [`${COMPILED}.toml`, `${THEIR_OWN_ROLE}.toml`].sort(),
    );
  });
});
