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

// The folders step 2 names, per provider. Written out rather than imported
// from `@workspace/compile`: this file is on the static graph, and that import
// fails `scripts/first-paint-budget.ts`. The e2e specs pin both rows.
type InstalledPaths = {
  configTs: string
  ejectedSkills: Record<(typeof SKILL_SCOPES)[number], string>
  globalRoot: string
  agentFiles: string
}

const INSTALLED_PATHS = {
  claude: {
    // eslint-disable-next-line no-restricted-syntax -- a compile import breaks the first-paint budget
    configTs: ".agents-inc/claude/config.ts",
    ejectedSkills: { project: ".claude/skills/", global: "~/.claude/skills/" },
    globalRoot: "~/.claude",
    agentFiles: "sub-agent front-matter",
  },
  codex: {
    // eslint-disable-next-line no-restricted-syntax -- as above
    configTs: ".agents-inc/codex/config.ts",
    ejectedSkills: { project: ".agents/skills/", global: "~/.codex/skills/" },
    globalRoot: "~/.codex",
    agentFiles: "sub-agent role files",
  },
} as const satisfies Record<Provider, InstalledPaths>

const counted = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

type EjectedCopy = { count: number; folder: string }

const isEjected = (skill: InventorySkill) => skill.install === "eject"

const ejectedCopies = (
  inventory: InstallInventory,
  folders: InstalledPaths["ejectedSkills"]
): EjectedCopy[] =>
  SKILL_SCOPES.map((scope) => ({
    count: inventory[scope].filter(isEjected).length,
    folder: folders[scope],
  })).filter((copy) => copy.count > 0)

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

// An added skill comes from someone else's repository, so its name opens its
// contents, over this dialog.
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
                isEjected(skill) ? "text-brand-ink" : "text-muted-foreground"
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
          // Counted by specs against the footer's number.
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

// Named rather than listed: this pane lists only files about to be written.
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

// Found in the line, not assumed last: the provider flag follows it.
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

// No Install button: installing is a CLI action.
export function InstallDialog({ config }: { config: ConfigSelection }) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const stacks = useCatalogStore((state) => state.stacks)
  // The seated marketplace, which the payload is stamped with. Subscribed: the
  // dialog survives a swap underneath it.
  const marketplace = useCatalogStore((state) => state.marketplace)
  const provider = useUiStore((state) => state.provider)
  const paths = INSTALLED_PATHS[provider]

  const inventory = selectInstallInventory(config, provider)
  const stats = summarize(config)
  const stack = stacks.find((candidate) => candidate.id === config.stackId)

  const agentsByScope = {
    project: inventory.agents.filter((entry) => entry.scope === "project"),
    global: inventory.agents.filter((entry) => entry.scope === "global"),
  }

  // The furthest the funnel can observe.
  const open = dialog === "install"

  const { command, copied, copy, note, text } = useInstallCommand(config, open)
  useEffect(() => {
    if (!open) return

    track({
      name: "install_opened",
      skillCount: stats.skillCount,
      agentCount: stats.agentCount,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts are a snapshot at open
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

        {/* In a short window both lists scroll here as one, and they are
            mostly text, so the row itself takes focus for the keyboard. */}
        <DialogPanes
          role="region"
          aria-label="Skills and agents"
          tabIndex={0}
          className="outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
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
                <CommandBlock
                  copyable
                  // The hook's string, so the announced and copied text agree.
                  aria-label={`Copy ${text}`}
                  onClick={() => void copy()}
                >
                  {command.status === "ready" ? (
                    <MarkedId text={text} id={command.id} />
                  ) : (
                    text
                  )}
                </CommandBlock>
                {/* Always rendered, so the block never shifts when clicked. */}
                <p
                  className={`pt-1.5 font-mono text-8 font-medium tracking-[.13em] uppercase ${
                    copied ? "text-brand-ink" : "text-muted-foreground"
                  }`}
                >
                  {note}
                </p>
                {/* An untrusted Codex project silently ignores sub-agents. */}
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
            {/* The inventory's count, so it matches the pane above. */}
            {counted(stats.skillCount, "skill")} ·{" "}
            {counted(inventory.agents.length, "sub-agent")} ·{" "}
            {stats.ejectedCount} ejected · change it later with{" "}
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
