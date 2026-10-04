import type { Provider } from "@workspace/compile"
import { DOMAIN_LABELS } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { CommandBlock } from "@workspace/ui/components/command-block"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneHeading,
  DialogPanes,
  DialogRule,
} from "@workspace/ui/components/dialog"

import { Fragment, useEffect } from "react"

import {
  PUBLIC_MARKETPLACE,
  selectInstallInventory,
  summarize,
  type InstallInventory,
  type InventoryAgent,
  type InventorySkill,
} from "@/features/configure/lib/derive"
import {
  agentsLeftOutOfCodexNotice,
  untrustedProjectNote,
} from "@/features/configure/lib/provider"
import { useInstallCommand } from "@/features/configure/lib/use-install-command"
import { track } from "@/lib/analytics/track"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useCatalogStore } from "@/stores/catalog-store"
import { SKILL_SCOPES } from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"

/**
 * The three folders step 2 names, per provider: the config pair a fresh install creates, where an
 * ejected skill lands, and the global root the rest of it goes under.
 *
 * ONE TABLE RATHER THAN THREE TERNARIES, so a provider added to the control is a missing key here
 * rather than three sentences that were each read separately — `satisfies Record<Provider, …>` is
 * what turns it into a compiler error.
 *
 * The Codex row is not a translation of the Claude one. A project skill on Codex is a committed
 * file at `<repo>/.agents/skills/`, which is Codex's OWN mechanism for a project skill — it reaches
 * the model in that repo and nowhere else with no plugin, no marketplace and no trust entry — and
 * the global root is `$CODEX_HOME`, which on a clean machine is `~/.codex` (D14). `~/.agents/skills`
 * also reaches the model and is deliberately not this: uninstall and doctor have to agree with
 * where Codex actually reads.
 *
 * THIS STEP SAID `agents/config.ts` FROM 2026-08-04 UNTIL THIS CHANGE — a path
 * under a directory an install creates at neither root, and the one line of the
 * dialog nothing asserted on. The docs page `editor/install-and-share.md` has
 * named the config pair's real home the whole time; D11 is the ruling to make
 * the two agree, taken while the folder itself was being renamed.
 *
 * WRITTEN OUT, WHERE `output-preview.ts` IMPORTS THE SAME NAME FROM
 * `@workspace/compile`, AND THE DIFFERENCE IS MEASURED RATHER THAN A PREFERENCE.
 * This dialog is on the static graph; the preview is reached through `import()`
 * and stays off it. A single import of that package from here makes its whole
 * barrel statically reachable — `packages/compile` has no `sideEffects: false`
 * to shake it, and `vite.config.ts`'s `compile` chunk group is ranked LAST
 * precisely so the chunk stays lazy — which `scripts/first-paint-budget.ts`
 * refuses:
 *
 *   First paint is 490.0 KB gzipped, 146.0 KB over the 344.0 KB budget.
 *     assets/compile-De6xxjYT.js — 124.7 KB
 *
 * (`bunx vite build` in apps/editor, 2026-09-20. The build fails there with
 * spa-fallback-shell's message rather than that one — see the note below.)
 *
 * 124.7 KB on every first paint to avoid re-typing one path is the wrong trade,
 * and the rest of the table is written out for the same reason. What the copy
 * costs is that it does not move on its own, which is what the two pins are
 * for: `e2e/specs/install-dialog.spec.ts` holds the Claude row and
 * `e2e/specs/codex-provider.spec.ts` holds the Codex one, each naming the path
 * its provider writes AND the other provider's as an absence — a sentence
 * naming both would satisfy either assertion alone.
 */
type InstalledPaths = {
  /** The config pair's own file, inside the source folder a fresh install creates. */
  configTs: string
  /**
   * Where an ejected skill's directory is copied to, by the skill's scope.
   *
   * ONE FOLDER PER SCOPE, and it was one folder for both until this change: the step sent every
   * ejected skill to the project's `.claude/skills/`, while the CLI copies a global one under the
   * home directory — and every skill rests at global, so the folder named was wrong for the
   * configuration nobody had touched.
   */
  ejectedSkills: Record<(typeof SKILL_SCOPES)[number], string>
  /** The root everything not in the project goes under. */
  globalRoot: string
  /**
   * WHAT A COMPILED SUB-AGENT IS WRITTEN AS, which is not the same file on the two providers.
   *
   * It said "sub-agent front-matter" on both until this change, and on Codex that named a file
   * nothing writes: a Codex sub-agent is an agent role definition in TOML under `.codex/agents/`,
   * with no frontmatter in it. A reader told to look for frontmatter after a Codex install finds
   * none and has no way to tell a naming difference from a failed install.
   *
   * In the table for the reason the three paths are: a provider added to the control is a missing
   * key here rather than a fourth sentence somebody has to remember to read.
   */
  agentFiles: string
}

const INSTALLED_PATHS = {
  claude: {
    // eslint-disable-next-line no-restricted-syntax -- importing the name from @workspace/compile puts its 124.7 KB chunk on the first-paint path and fails scripts/first-paint-budget.ts at 490.0 KB against 344.0 KB; the docblock above carries the measurement
    configTs: ".agents-inc/claude/config.ts",
    ejectedSkills: { project: ".claude/skills/", global: "~/.claude/skills/" },
    globalRoot: "~/.claude",
    agentFiles: "sub-agent front-matter",
  },
  codex: {
    // eslint-disable-next-line no-restricted-syntax -- the same measurement, and the same reason: this file is on the static graph
    configTs: ".agents-inc/codex/config.ts",
    ejectedSkills: { project: ".agents/skills/", global: "~/.codex/skills/" },
    globalRoot: "~/.codex",
    agentFiles: "sub-agent role files",
  },
} as const satisfies Record<Provider, InstalledPaths>

/** A count and its noun, which is singular for one: `1 skill`, `2 skills`. */
const counted = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

type EjectedCopy = { count: number; folder: string }

const isEjected = (skill: InventorySkill) => skill.install === "eject"

/**
 * What step 2 says is copied rather than linked: one copy per scope that ejects anything, each to
 * its own scope's folder, in the order the panes above list the scopes.
 */
const ejectedCopies = (
  inventory: InstallInventory,
  folders: InstalledPaths["ejectedSkills"]
): EjectedCopy[] =>
  SKILL_SCOPES.map((scope) => ({
    count: inventory[scope].filter(isEjected).length,
    folder: folders[scope],
  })).filter((copy) => copy.count > 0)

/**
 * `ejects 1 skill into ~/.claude/skills/`, and a second copy joined on with `and` when both scopes
 * eject. A configuration that ejects nothing names no folder at all: `0 skills into
 * .claude/skills/` was a sentence about a folder nothing is copied to.
 */
function EjectClause({ copies }: { copies: EjectedCopy[] }) {
  if (copies.length === 0) return "ejects no skills"

  return (
    <>
      ejects{" "}
      {copies.map(({ count, folder }, index) => (
        <Fragment key={folder}>
          {index > 0 && " and "}
          {counted(count, "skill")} into{" "}
          <em className="font-mono text-10 text-ink not-italic">{folder}</em>
        </Fragment>
      ))}
    </>
  )
}

// A skill's name in the inventory. An added one's is a button, because this is
// the list of what is about to be written to the reader's disk and an added
// skill is the part of it written from somebody else's repository — EDITOR-32's
// second way in, and the one the EDITOR-03 ruling is really about. The preview
// opens OVER this dialog rather than replacing it, so the question can be asked
// without losing the list that prompted it.
function InventoryName({ skill }: { skill: InventorySkill }) {
  const previewSkill = useUiStore((state) => state.previewSkill)

  if (!skill.added) return <span className="truncate">{skill.displayName}</span>

  return (
    <button
      type="button"
      aria-label={`Contents of ${skill.displayName}`}
      onClick={() => previewSkill(skill.id)}
      className="cursor-pointer truncate text-left underline decoration-brand-border underline-offset-[0.1875rem] outline-none hover:text-brand-ink focus-visible:ring-1 focus-visible:ring-ring"
    >
      {skill.displayName}
    </button>
  )
}

function ScopeGroup({
  label,
  skills,
  first = false,
}: {
  label: string
  skills: InventorySkill[]
  first?: boolean
}) {
  if (skills.length === 0) return null

  return (
    <>
      <div
        className={`pb-1.5 font-mono text-8 font-medium tracking-[.13em] text-brand-ink uppercase ${
          first ? "pt-0" : "pt-3"
        }`}
      >
        {label}
      </div>
      <div className="columns-2 gap-x-[1.625rem]">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex break-inside-avoid items-baseline gap-[0.4375rem] py-0.5 text-11 text-ink-2"
          >
            <InventoryName skill={skill} />
            <span
              className={`ml-auto shrink-0 font-mono text-8 font-medium tracking-[.06em] uppercase ${
                skill.install === "eject"
                  ? "text-brand-ink"
                  : "text-muted-foreground"
              }`}
            >
              {skill.install}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// The same split on the other pane. Sub-agent front-matter used to be written
// into the project unconditionally, which made its heading decoration; scope
// is what turns it into the statement the skills pane's headings already are.
function AgentScopeGroup({
  label,
  agents,
  first = false,
}: {
  label: string
  agents: InventoryAgent[]
  first?: boolean
}) {
  if (agents.length === 0) return null

  return (
    <>
      <div
        className={`pb-1.5 font-mono text-8 font-medium tracking-[.13em] text-brand-ink uppercase ${
          first ? "pt-0" : "pt-3"
        }`}
      >
        {label}
      </div>
      {agents.map(({ agent, baseOnly }) => (
        <div
          key={agent.id}
          // The footer states how many of these there are, so the rows have to
          // be countable from outside: the two numbers agreeing is the claim,
          // and a spec that re-derived the count from the configuration would
          // compare the bug to itself.
          data-slot="inventory-agent"
          className="py-0.5 text-11 text-ink-2"
        >
          {DOMAIN_LABELS[agent.domainId].toLowerCase()} ·{" "}
          {agent.label.toLowerCase()}
          {/* A pinned agent installs as front-matter alone. */}
          {baseOnly && (
            <span className="pl-1.5 text-10 text-roster-empty">
              no skills — base agent
            </span>
          )}
        </div>
      ))}
    </>
  )
}

/**
 * The sub-agents this provider does not install, named rather than simply absent.
 *
 * The roster keeps both rows and disables them (D18). This pane cannot: it is the list of files
 * about to be written, so a row here for a file that is not written is the disagreement that
 * disabled row exists to prevent. The rows go and the sentence stays — and nothing is drawn at all
 * on Claude, or for a configuration that never pinned one, because an install that left nothing out
 * has nothing to report.
 */
function AgentsLeftOut({ agents }: { agents: InstallInventory["leftOut"] }) {
  if (agents.length === 0) return null

  return (
    <p className="pt-3 text-11 leading-[1.5] text-muted-foreground italic">
      {agentsLeftOutOfCodexNotice(
        agents.map((agent) => agent.label.toLowerCase())
      )}
    </p>
  )
}

/**
 * The command with its id picked out in amber — rule 4's "mark what they chose".
 *
 * FOUND IN THE LINE rather than assumed to end it. It was the last word until the provider flag
 * landed after it, and a render that split on the last space then coloured `codex` would have gone
 * on looking right — one amber word on the line either way.
 */
function MarkedId({ text, id }: { text: string; id: string }) {
  const at = text.indexOf(id)

  return (
    <>
      {text.slice(0, at)}
      <span className="text-brand-ink">{id}</span>
      {text.slice(at + id.length)}
    </>
  )
}

// An inventory of what will be written, then the two commands that write it.
//
// There is deliberately **no Install button**: installing is a CLI action, so
// the dialog's job is to tell the user exactly what they are about to get and
// hand them the command. The only action is Close.
export function InstallDialog({ config }: { config: ConfigSelection }) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const stacks = useCatalogStore((state) => state.stacks)
  // The marketplace SEATED in this tab, and the only one of the three notions
  // this line may read: the command below hands over a payload stamped with
  // `activeMarketplace()`, so naming anything else would describe an install
  // that is not the one about to happen. Subscribed rather than read once,
  // because the dialog survives a swap underneath it.
  const marketplace = useCatalogStore((state) => state.marketplace)
  // Which provider's tree the sentence below describes. The command carries the
  // provider to the CLI; these are the folders that command then writes.
  const provider = useUiStore((state) => state.provider)
  const paths = INSTALLED_PATHS[provider]

  const inventory = selectInstallInventory(config, provider)
  const stats = summarize(config)
  const stack = stacks.find((candidate) => candidate.id === config.stackId)

  const agentsByScope = {
    project: inventory.agents.filter((entry) => entry.scope === "project"),
    global: inventory.agents.filter((entry) => entry.scope === "global"),
  }

  // The end of the funnel. There is no Install button to click — installing
  // is a CLI action — so reaching this dialog is the furthest the web app can
  // observe someone getting, and the size of the configuration they got there
  // with is what makes the drop-off before it readable.
  const open = dialog === "install"

  const { command, copied, copy, note, text } = useInstallCommand(config, open)
  useEffect(() => {
    if (!open) return

    track({
      name: "install_opened",
      skillCount: stats.skillCount,
      agentCount: stats.agentCount,
    })
    // Only the transition to open matters; the counts are a snapshot of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(open) => !open && setDialog("none")}>
      <DialogContent wide>
        <DialogHeader
          title="Install"
          subtitle={
            <>
              marketplace{" "}
              <em className="text-ink not-italic">
                {marketplace ?? PUBLIC_MARKETPLACE}
              </em>
              {stack ? (
                <>
                  {" · "}stack{" "}
                  <em className="text-ink not-italic">
                    {stack.name.toLowerCase()}
                  </em>
                </>
              ) : null}
            </>
          }
        />

        <DialogPanes>
          <DialogPane side="left">
            <DialogPaneHeading>Skills</DialogPaneHeading>
            <ScopeGroup label="Project" skills={inventory.project} first />
            <ScopeGroup label="Global" skills={inventory.global} />
            {stats.skillCount === 0 && (
              <p className="text-11 text-muted-foreground italic">
                Nothing selected yet.
              </p>
            )}
          </DialogPane>

          <DialogPane side="right">
            <DialogPaneHeading>Agents</DialogPaneHeading>
            <AgentScopeGroup
              label="Project"
              agents={agentsByScope.project}
              first
            />
            <AgentScopeGroup label="Global" agents={agentsByScope.global} />
            <AgentsLeftOut agents={inventory.leftOut} />
          </DialogPane>
        </DialogPanes>

        <DialogRule strong />

        <DialogBody>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="shrink-0 pt-[0.1875rem] font-mono text-10 font-medium text-brand-faint">
                01
              </span>
              <div className="min-w-0 flex-1">
                <p className="pb-1.5 text-11 leading-[1.5] text-ink-3">
                  Go to your project root — the folder holding{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    package.json
                  </em>
                  . Project-scoped skills are written relative to it.
                </p>
                <CommandBlock>cd ~/code/your-project</CommandBlock>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 pt-[0.1875rem] font-mono text-10 font-medium text-brand-faint">
                02
              </span>
              <div className="min-w-0 flex-1">
                <p className="pb-1.5 text-11 leading-[1.5] text-ink-3">
                  Run the installer. It writes{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    {paths.configTs}
                  </em>{" "}
                  and {paths.agentFiles},{" "}
                  <EjectClause
                    copies={ejectedCopies(inventory, paths.ejectedSkills)}
                  />
                  , and links the rest as plugins. Global skills land in{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    {paths.globalRoot}
                  </em>
                  .
                </p>
                {/* The id is what carries this configuration to the CLI, so
                    it is the one part of the command the user did not already
                    know — amber, per rule 4, marks what they chose.

                    `copyable` carries the button semantics and the keyboard
                    path, so what belongs here is the name and the action. */}
                <CommandBlock
                  copyable
                  // The hook's own string, not a second copy assembled here —
                  // otherwise what is announced and what is copied drift the
                  // first time the command changes shape.
                  aria-label={`Copy ${text}`}
                  onClick={() => void copy()}
                >
                  {command.status === "ready" ? (
                    <MarkedId text={text} id={command.id} />
                  ) : (
                    text
                  )}
                </CommandBlock>
                {/* The line under the command, which is also where the id's
                    absence is explained rather than left as a silently shorter
                    command. Its words come from the hook, one per ending, so a
                    refusal a reload would fix is not spelled like the two
                    nothing fixes (SERVER-04). Always rendered, so the block
                    never shifts under the cursor the moment it is clicked. */}
                <p
                  className={`pt-1.5 font-mono text-8 font-medium tracking-[.13em] uppercase ${
                    copied ? "text-brand-ink" : "text-muted-foreground"
                  }`}
                >
                  {note}
                </p>
                {/* WHAT HAPPENS AFTER THE COMMAND SUCCEEDS, on the one provider
                    where success is not the whole story. An untrusted Codex
                    project install is half live — the skills reach the model,
                    the sub-agents are ignored in total silence — and silence
                    is the reason this is on screen rather than left to the
                    install's own output. Drawn only on Codex: Claude has no
                    trust step and a sentence about one would be a step nobody
                    has to take. */}
                {provider === "codex" && (
                  <p className="pt-1.5 text-11 leading-[1.5] text-muted-foreground italic">
                    {untrustedProjectNote()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogFooterNote>
            {/* The sub-agent count is the INVENTORY's length, not
                `summarize`'s: the pane above lists what this provider writes,
                and a footer counting the configuration instead said eleven over
                a list of nine. One derivation, read twice. */}
            {counted(stats.skillCount, "skill")} ·{" "}
            {counted(inventory.agents.length, "sub-agent")} ·{" "}
            {stats.ejectedCount} ejected · change it later with{" "}
            {/* Whole, because a command is read and typed whole: wrapped, it
                left `edit` on a line of its own. The prose before it wraps
                instead. */}
            <em className="whitespace-nowrap text-ink not-italic">
              npx agents-inc edit
            </em>
          </DialogFooterNote>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
