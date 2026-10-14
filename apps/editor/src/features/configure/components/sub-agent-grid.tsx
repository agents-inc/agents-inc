import { SUB_AGENT_GROUPS } from "@workspace/matrix"
import { Lattice } from "@workspace/ui/components/lattice"

import { useLatticeColumns } from "@/features/configure/lib/use-lattice-columns"
import { SubAgentCard, type AgentSelection } from "./sub-agent-card"

// A short group keeps the quarter-width cards rather than stretching them.
export function SubAgentGrid({ config }: { config: AgentSelection }) {
  const columns = useLatticeColumns()

  return SUB_AGENT_GROUPS.map((group) => (
    <div
      key={group.domainId}
      role="group"
      aria-label={`${group.label} sub-agents`}
    >
      <div className="flex items-center px-0.5 pt-[1.375rem] pb-2">
        <span className="font-mono text-9 font-semibold tracking-[.12em] whitespace-nowrap text-ink uppercase">
          {group.label}
        </span>
      </div>

      <Lattice columns={columns}>
        {group.agents.map((agent) => (
          <SubAgentCard key={agent.id} agent={agent} config={config} />
        ))}
      </Lattice>
    </div>
  ))
}
