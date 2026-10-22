import type { SubAgent } from "@workspace/matrix"
import {
  ButtonGroup,
  ButtonGroupItem,
  buttonGroupItemVariants,
  buttonGroupVariants,
} from "@workspace/ui/components/button-group"
import {
  LatticeCell,
  LatticeCellButton,
} from "@workspace/ui/components/lattice"
import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"

import { agentRefusal } from "@/features/configure/lib/provider"
import { useConfigStore } from "@/stores/config-store"
import {
  AGENT_EFFORTS,
  AGENT_SCOPES,
  chosenModelFor,
  isAgentOn,
  modelChoicesFor,
  modelPatchFor,
  resolveAgentOptions,
  restingAgentOptions,
  type AgentEffort,
  type AgentOptions,
  type PersistedConfig,
} from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"

export type AgentSelection = Pick<PersistedConfig, "skills" | "agents">

type SegmentTone = "plain" | "recede"

const barTone = (filled: boolean, installed: boolean) => {
  if (!filled) return "bg-hairline group-hover/track:bg-rule"
  return installed ? "bg-brand" : "bg-field-faint"
}

function EffortTrack({
  agentId,
  effort,
  installed,
  onPick,
}: {
  agentId: string
  effort: AgentEffort
  installed: boolean
  onPick: (effort: AgentEffort) => void
}) {
  const level = AGENT_EFFORTS.indexOf(effort)

  return (
    <span className="ml-auto flex flex-none items-center gap-2">
      <span
        className={cn(
          "font-mono text-8 font-medium tracking-[.06em] uppercase",
          installed ? "text-brand-ink" : "text-field-faint"
        )}
      >
        {effort}
      </span>
      <div
        role="radiogroup"
        aria-label={`Effort for ${agentId}`}
        onKeyDown={moveToAdjacentRadio}
        className="group/track pointer-events-auto flex items-center gap-[0.3125rem]"
      >
        {AGENT_EFFORTS.map((value, index) => {
          const checked = value === effort
          const filled = index <= level

          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={value}
              title={value}
              tabIndex={checked ? 0 : -1}
              data-filled={filled || undefined}
              onClick={() => onPick(value)}
              className="flex h-4 w-[0.875rem] cursor-pointer items-center outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className={cn("block h-1 w-full", barTone(filled, installed))}
              />
            </button>
          )
        })}
      </div>
    </span>
  )
}

type ModelRowProps = {
  agentId: string
  options: AgentOptions
  tone: SegmentTone
  onPatch: (patch: Partial<AgentOptions>) => void
}

function ClaudeModelRadios({ agentId, options, tone, onPatch }: ModelRowProps) {
  const chosen = chosenModelFor("claude", options)

  return (
    <ButtonGroup
      aria-label={`Model for ${agentId}`}
      className="pointer-events-auto flex-none"
    >
      {modelChoicesFor("claude").map(({ value, label }) => (
        <ButtonGroupItem
          key={value}
          size="segment"
          preset="card"
          tone={tone}
          active={value === chosen}
          aria-label={value}
          onClick={() => onPatch(modelPatchFor("claude", value))}
        >
          {label}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  )
}

// Toggles, not radios: none pressed is the session's own model.
function CodexModelToggles({ agentId, options, tone, onPatch }: ModelRowProps) {
  const pinned = chosenModelFor("codex", options)
  const released = restingAgentOptions(agentId).codexModel

  return (
    <div
      role="group"
      aria-label={`Model for ${agentId}`}
      className={cn(buttonGroupVariants(), "pointer-events-auto flex-none")}
    >
      {modelChoicesFor("codex").map(({ value, label }) => {
        const pressed = value === pinned

        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            aria-label={value}
            onClick={() =>
              onPatch(modelPatchFor("codex", pressed ? released : value))
            }
            className={cn(
              buttonGroupItemVariants({
                size: "segment",
                preset: "card",
                tone,
                active: pressed,
              }),
              "outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// A sub-agent Codex leaves out is drawn off and refuses the press, keeping its
// pin.
export function SubAgentCard({
  agent,
  config,
}: {
  agent: SubAgent
  config: AgentSelection
}) {
  const toggleAgentPin = useConfigStore((state) => state.toggleAgentPin)
  const setAgentOption = useConfigStore((state) => state.setAgentOption)
  const provider = useUiStore((state) => state.provider)

  const refusal = agentRefusal(provider, agent.id)
  const pressable = refusal === undefined
  const installed = pressable && isAgentOn(config, agent.id)
  const options = resolveAgentOptions(config.agents, agent.id)
  const tone = installed ? "plain" : "recede"
  const configure = (patch: Partial<AgentOptions>) =>
    setAgentOption(agent.id, patch)

  return (
    <LatticeCell
      selected={installed}
      interactive={pressable}
      className="px-3 pt-[0.6875rem] pb-2.5"
    >
      <LatticeCellButton
        aria-label={agent.label}
        aria-pressed={installed}
        aria-disabled={!pressable || undefined}
        title={refusal}
        onClick={() => pressable && toggleAgentPin(agent.id)}
      />

      <div className="pointer-events-none relative z-1 flex min-h-4 items-center gap-2.5">
        <span
          className={cn(
            "min-w-0 truncate text-12 leading-[1.25] font-semibold",
            installed ? "text-ink" : "text-faint"
          )}
        >
          {agent.label}
        </span>
        <EffortTrack
          agentId={agent.id}
          effort={options.effort}
          installed={installed}
          onPick={(effort) => configure({ effort })}
        />
      </div>

      {/* Wraps rather than clips: a clipped scope cannot be picked. */}
      <div className="pointer-events-none relative z-1 mt-[0.5625rem] -ml-1 flex min-w-0 flex-wrap items-center gap-1.5">
        {provider === "codex" ? (
          <CodexModelToggles
            agentId={agent.id}
            options={options}
            tone={tone}
            onPatch={configure}
          />
        ) : (
          <ClaudeModelRadios
            agentId={agent.id}
            options={options}
            tone={tone}
            onPatch={configure}
          />
        )}

        <ButtonGroup
          aria-label={`Scope for ${agent.id}`}
          className="pointer-events-auto flex-none"
        >
          {AGENT_SCOPES.map((scope) => (
            <ButtonGroupItem
              key={scope}
              size="segment"
              preset="card"
              tone={tone}
              active={scope === options.scope}
              onClick={() => configure({ scope })}
            >
              {scope}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>
    </LatticeCell>
  )
}
