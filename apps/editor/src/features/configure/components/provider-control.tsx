import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"

import { PROVIDER_CHOICES } from "@/features/configure/lib/provider"
import { useUiStore } from "@/stores/ui-store"

// The caption the group is named by. An id rather than an `aria-label`, because
// the word is already on screen: a label assembled separately is a second copy
// of it that can only ever disagree.
const LABEL_ID = "provider-label"

/**
 * WHICH CODING AGENT THIS CONFIGURATION IS FOR — the one control on this screen that changes
 * nothing about the configuration.
 *
 * A RADIOGROUP, not a pair of toggles, and that is a claim about installations rather than a
 * styling choice: one installation belongs to exactly one provider, so the row is one choice among
 * two. It is also what buys the row ONE tab stop with the arrows moving inside it, which
 * `moveToAdjacentRadio` gives every `ButtonGroup` — a visitor reaches the control in one press
 * instead of walking past both halves of it.
 *
 * In the footer, above the actions rather than among them: the cells below DO something, and this
 * line states what the configuration is for. It is the last thing read before Install, and
 * Install's command is what it changes.
 *
 * IT RESTS ON CLAUDE and nothing moves it there — `init --from <id>` with no flag installs Claude,
 * so the resting state of the control and the resting state of the command are one fact.
 */
export function ProviderControl() {
  const provider = useUiStore((state) => state.provider)
  const setProvider = useUiStore((state) => state.setProvider)

  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span
        id={LABEL_ID}
        className="shrink-0 font-mono text-8 font-medium tracking-[.12em] text-roster-off uppercase"
      >
        provider
      </span>
      <ButtonGroup aria-labelledby={LABEL_ID} className="ml-auto flex-none">
        {PROVIDER_CHOICES.map((choice) => (
          <ButtonGroupItem
            key={choice}
            active={provider === choice}
            onClick={() => setProvider(choice)}
          >
            {choice}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  )
}
