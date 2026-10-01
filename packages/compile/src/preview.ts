import {
  AGENT_CORPUS,
  CORPUS_CLI_VERSION,
  CORPUS_TEMPLATES,
} from "./generated/corpus.js"
import {
  buildAgentTemplateContext,
  renderAgent,
  renderAgentBody,
  renderAgentRoleToml,
} from "./agent-source.js"
import { createEngineFromTemplates } from "./engine.js"
import { sourceDirName, type Provider } from "./source-layout.js"
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
 * The engine a preview renders on, built for the provider being previewed.
 *
 * The provider is an ARGUMENT rather than a constant, and that is the same ruling C2 took when it
 * deleted `DEFAULT_PROVIDER`: a render that leaves the question unasked answers Claude, and it
 * answers it silently. A compiled sub-agent's own prose can name the install's source folder, so
 * the engine built for the wrong provider produces a body that reads `.agents-inc/claude/` inside a
 * Codex role file — which no assertion comparing a preview against itself could ever see.
 */
const engineFor = (provider: Provider) =>
  createEngineFromTemplates(CORPUS_TEMPLATES, {
    sourceFolder: sourceDirName(provider),
  })

const contextFor = (name: AgentName, agent: AgentConfig) =>
  buildAgentTemplateContext(name, agent, AGENT_CORPUS[name])

/**
 * The markdown a CLAUDE install would write for one sub-agent, rendered from the
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
  return renderAgent(engineFor("claude"), contextFor(name, agent), version)
}

/**
 * The agent ROLE DEFINITION a Codex install would write for one sub-agent: the same prose, with no
 * frontmatter fence, carried whole inside `developer_instructions` beside the keys Codex requires.
 *
 * A Codex sub-agent is not the same file as a Claude one, which is why this is a second door rather
 * than a flag on the first. It is still the same two builders the CLI's install path calls —
 * `renderAgentBody` over `renderAgentRoleToml` — because a preview is worth drawing only if
 * somebody can diff it against a real install and have it survive, and Codex's deserializer drops a
 * role file whole on one unknown key while saying so in a startup warning nobody is reading.
 */
export async function renderAgentRoleFromCorpus(
  name: AgentName,
  agent: AgentConfig,
  version: string = CORPUS_CLI_VERSION
): Promise<string> {
  return renderAgentRoleToml(
    agent,
    await renderAgentBody(engineFor("codex"), contextFor(name, agent), version)
  )
}
