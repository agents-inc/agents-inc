import { getRouteApi } from "@tanstack/react-router"
import { STACKS } from "@workspace/matrix"
import { Hinge } from "@workspace/ui/components/divider"
import { useCallback, useMemo } from "react"

import { selectDomainViews } from "@/features/configure/lib/derive"
import { useSharedImport } from "@/features/configure/lib/use-shared-import"
import { useAddedSkillsStore } from "@/stores/added-skills-store"
import { useConfigStore } from "@/stores/config-store"
import { AddSkillDialog } from "./add-skill-dialog"
import { DomainSection } from "./domain-section"
import { FilterBar } from "./filter-bar"
import { InstallDialog } from "./install-dialog"
import { RosterPanel } from "./roster-panel"
import { StackGrid } from "./stack-grid"
import { StackSwitchDialog } from "./stack-switch-dialog"

const route = getRouteApi("/")

export function ConfigureScreen() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const skills = useConfigStore((state) => state.skills)
  const stackId = useConfigStore((state) => state.stackId)
  const agents = useConfigStore((state) => state.agents)
  const added = useAddedSkillsStore((state) => state.added)

  const clearFromId = useCallback(
    () =>
      void navigate({
        search: (prev) => ({ ...prev, fromId: "" }),
        replace: true,
      }),
    [navigate]
  )
  const importError = useSharedImport(search.fromId, clearFromId)

  const config = useMemo(
    () => ({ stackId, skills, agents }),
    [stackId, skills, agents]
  )
  const domainViews = useMemo(
    () => selectDomainViews(config, added, search),
    [config, added, search]
  )

  const stack = STACKS.find((candidate) => candidate.id === stackId)

  return (
    <>
      <main className="min-w-0 bg-column px-gutter pt-0 pb-30">
        {importError && (
          <p
            role="alert"
            className="pt-4 font-mono text-11 text-muted-foreground italic"
          >
            {importError} — showing your own configuration instead.
          </p>
        )}

        <Hinge label="choose your stack" />
        <StackGrid />

        {/* The page's only instructional copy, and it changes with the stack. */}
        {stack ? (
          <Hinge label="then customise" emphasis={stack.name.toLowerCase()} />
        ) : (
          <Hinge label="then" emphasis="pick your skills" />
        )}

        <FilterBar search={search} />

        {domainViews.length === 0 ? (
          <p className="pt-[1.875rem] font-mono text-11 text-muted-foreground">
            No skills match this filter.
          </p>
        ) : (
          domainViews.map((view, index) => (
            <DomainSection key={view.id} view={view} first={index === 0} />
          ))
        )}
      </main>

      <RosterPanel config={config} added={added} />

      <StackSwitchDialog />
      <InstallDialog config={config} added={added} />
      <AddSkillDialog />
    </>
  )
}
