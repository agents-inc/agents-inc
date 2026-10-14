import type { Provider } from "@workspace/compile"
import { Lattice, LatticeCell } from "@workspace/ui/components/lattice"
import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { useId } from "react"

import { PROVIDER_CHOICES } from "@/features/configure/lib/provider"
import { useLatticeColumns } from "@/features/configure/lib/use-lattice-columns"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"

const CARDS = {
  claude: { name: "Claude Code", line: "plugins at project or global scope" },
  codex: { name: "Codex", line: "plugins install globally only" },
} as const satisfies Record<Provider, { name: string; line: string }>

// Step 01, on the stack card's face. One install has one provider, so the
// cards are a radiogroup: one tab stop, arrows move and choose.
export function ProviderGrid() {
  const provider = useUiStore((state) => state.provider)
  const setProvider = useUiStore((state) => state.setProvider)
  const moveRememberedPluginsToGlobal = useConfigStore(
    (state) => state.moveRememberedPluginsToGlobal
  )
  const columns = useLatticeColumns()
  const lineId = useId()

  // v6 §2 rule 2: on Codex no unselected plugin skill rests at project.
  const choose = (choice: Provider) => {
    setProvider(choice)
    if (choice === "codex") moveRememberedPluginsToGlobal()
  }

  return (
    <Lattice
      columns={columns}
      role="radiogroup"
      aria-label="Provider"
      onKeyDown={moveToAdjacentRadio}
    >
      {PROVIDER_CHOICES.map((choice) => {
        const chosen = provider === choice
        const { name, line } = CARDS[choice]
        const lineIdOfCard = `${lineId}-${choice}`

        return (
          <LatticeCell
            key={choice}
            selected={chosen}
            className="px-[0.8125rem] py-[0.6875rem]"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            aria-label={name}
            aria-describedby={lineIdOfCard}
            onClick={() => choose(choice)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                choose(choice)
              }
            }}
          >
            <span className="text-12 font-semibold text-ink">{name}</span>
            <span
              id={lineIdOfCard}
              className={`mt-1 font-mono text-9 font-normal ${
                chosen ? "text-brand-ink" : "text-subtle"
              }`}
            >
              {line}
            </span>
          </LatticeCell>
        )
      })}
    </Lattice>
  )
}
