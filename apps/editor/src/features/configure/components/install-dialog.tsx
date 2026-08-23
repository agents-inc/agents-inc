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

import { useEffect } from "react"

import {
  PUBLIC_MARKETPLACE,
  selectInstallInventory,
  summarize,
  type InventoryAgent,
  type InventorySkill,
} from "@/features/configure/lib/derive"
import { useInstallCommand } from "@/features/configure/lib/use-install-command"
import { track } from "@/lib/analytics/track"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useCatalogStore } from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"

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
        <div key={agent.id} className="py-0.5 text-11 text-ink-2">
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

  const inventory = selectInstallInventory(config)
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
                    agents/config.ts
                  </em>{" "}
                  and sub-agent front-matter, ejects {stats.ejectedCount} skills
                  into{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    .claude/skills/
                  </em>
                  , and links the rest as plugins. Global skills land in{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    ~/.claude
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
                    <>
                      {text.slice(0, text.lastIndexOf(" ") + 1)}
                      <span className="text-brand-ink">{command.id}</span>
                    </>
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
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogFooterNote>
            {stats.skillCount} skills · {stats.agentCount} sub-agents ·{" "}
            {stats.ejectedCount} ejected · change it later with{" "}
            <em className="text-ink not-italic">npx agents-inc edit</em>
          </DialogFooterNote>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
