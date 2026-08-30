import {
  AGENT_CORPUS,
  CORPUS_CLI_VERSION,
  CORPUS_TEMPLATES,
} from "./generated/corpus.js"
import { buildAgentTemplateContext, renderAgent } from "./agent-source.js"
import { createEngineFromTemplates } from "./engine.js"
import type { AgentConfig, AgentName } from "./types.js"

/**
 * The one module that holds both the vendored corpus and the template engine, so
 * everything heavy about this package sits behind a single `import()`.
 *
 * Nothing else here may import it — `src/index.ts` says so and `src/index.test.ts`
 * enforces it — because the editor's first-paint budget is what pays for a barrel
 * that drags the corpus onto the initial chunk.
 */

/** The release the vendored corpus was generated from, which is what a rendered agent is stamped with. */
export { CORPUS_CLI_VERSION }

/**
 * The markdown an install would write for one sub-agent, rendered from the
 * vendored corpus rather than from disk.
 *
 * Byte-identical to what `compileAgentForPlugin` writes for the same
 * `AgentConfig`, which `scripts/generate-compile-package.test.ts` asserts by
 * comparing the two renders directly.
 */
export async function renderAgentFromCorpus(
  name: AgentName,
  agent: AgentConfig,
  version: string = CORPUS_CLI_VERSION
): Promise<string> {
  return renderAgent(
    createEngineFromTemplates(CORPUS_TEMPLATES),
    buildAgentTemplateContext(name, agent, AGENT_CORPUS[name]),
    version
  )
}
