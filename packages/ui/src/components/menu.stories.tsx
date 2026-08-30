import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ComponentProps, useState } from "react"
import { expect, screen, userEvent, waitFor } from "storybook/test"

import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@workspace/ui/components/menu"

// The one menu the product draws: the roster panel's grouping control, two
// mutually exclusive values, no icons and no separator.
const GROUP_BYS = ["domain", "scope"] as const
type GroupBy = (typeof GROUP_BYS)[number]

// The trigger is the caller's, so this is the app's own shape: the accessible
// name is the ACTION, because the visible text is the current value and says
// nothing about what pressing it would do.
const TRIGGER = "Group sub-agents"

// `MenuRadioGroup` is controlled by construction — the wrapper omits
// `defaultValue`, because the value lives in a store and the menu is never its
// owner. So every story holds it.
//
// `setGroupBy` is accepted here without an annotation only because the wrapper
// is generic over the value: base-ui types `onValueChange` as `(value: any)`,
// which would have swallowed a handler of the wrong type silently.
function GroupControl(props: ComponentProps<typeof Menu>) {
  const [groupBy, setGroupBy] = useState<GroupBy>("domain")

  return (
    <Menu {...props}>
      <MenuTrigger aria-label={TRIGGER}>{groupBy} ▾</MenuTrigger>
      <MenuPopup>
        <MenuRadioGroup value={groupBy} onValueChange={setGroupBy}>
          {GROUP_BYS.map((option) => (
            <MenuRadioItem key={option} value={option}>
              {option}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  )
}

// The menu is portalled, so everything here is queried from `screen` rather
// than from the story canvas.
const meta = {
  title: "Components/Menu",
  component: Menu,
  render: (args) => <GroupControl {...args} />,
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { defaultOpen: true },
}

export const TheTriggerOpensTheMenu: Story = {
  play: async () => {
    await userEvent.click(screen.getByRole("button", { name: TRIGGER }))

    await expect(await screen.findByRole("menu")).toBeVisible()
  },
}

// The two options are one choice, not two independent toggles, and the roles
// are the only thing that says so — the design's own prototype draws the same
// picture out of plain `<div>`s and tells a screen reader nothing at all.
export const TheOptionsAnnounceOneExclusiveChoice: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await expect(screen.getByRole("group")).toContainElement(
      screen.getByRole("menuitemradio", { name: "domain" })
    )
  },
}

export const OnlyTheActiveOptionIsChecked: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await expect(
      screen.getByRole("menuitemradio", { name: "domain" })
    ).toHaveAttribute("aria-checked", "true")
    await expect(
      screen.getByRole("menuitemradio", { name: "scope" })
    ).toHaveAttribute("aria-checked", "false")
  },
}

// The tick sits in an `aria-hidden` slot, so the active option is named by its
// label alone. Left exposed it would announce as `domain ✓`, and every
// exact-name query — this suite's and the editor's E2E — would stop reaching
// the one row that matters.
export const TheActiveOptionIsNamedByItsLabelAlone: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await expect(
      screen.getByRole("menuitemradio", { name: "domain" })
    ).toHaveAccessibleName("domain")
  },
}

// The trigger's visible text is the current value, so it reading `scope ▾` is
// the caller's handler having been reached with the option that was picked.
export const PickingReportsTheChoice: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await userEvent.click(screen.getByRole("menuitemradio", { name: "scope" }))

    await expect(
      screen.getByRole("button", { name: TRIGGER })
    ).toHaveTextContent("scope ▾")
  },
}

// Base UI leaves a radio item open on click and this wrapper does not; a
// two-item mode switch has nothing further to offer once one is taken.
export const PickingClosesTheMenu: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await userEvent.click(screen.getByRole("menuitemradio", { name: "scope" }))

    await waitFor(async () => {
      await expect(screen.queryByRole("menu")).toBeNull()
    })
  },
}

// The whole reason this is a primitive rather than hand-rolled markup: the
// design's prototype has no keyboard path at all. Arrows and Enter, no pointer
// anywhere.
//
// Every step between the presses is a wait rather than a read, because Base UI
// moves focus into the popup in one effect and the highlight in another. An
// arrow sent before the popup has focus reaches nothing, and an Enter sent
// before the highlight has landed picks whichever option it had reached.
export const TheKeyboardCanPick: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const menu = await screen.findByRole("menu")
    await waitFor(async () => {
      await expect(menu).toHaveFocus()
    })

    await userEvent.keyboard("{ArrowDown}")
    await waitFor(async () => {
      await expect(
        screen.getByRole("menuitemradio", { name: "domain" })
      ).toHaveFocus()
    })

    await userEvent.keyboard("{ArrowDown}")
    await waitFor(async () => {
      await expect(
        screen.getByRole("menuitemradio", { name: "scope" })
      ).toHaveFocus()
    })

    await userEvent.keyboard("{Enter}")

    await waitFor(async () => {
      await expect(
        screen.getByRole("button", { name: TRIGGER })
      ).toHaveTextContent("scope ▾")
    })
  },
}

// Every focusable control this package ships draws one ring, and a menu item
// is the one a pointer never has to reach — arrows are its whole path. Axe
// cannot check a focus indicator, so this story is the entire gate.
//
// The waits are `TheKeyboardCanPick`'s and are there for its reason: Base UI
// moves focus into the popup in one effect and the highlight in another, and
// an arrow sent before the popup has focus reaches nothing.
export const FocusDrawsTheRing: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const menu = await screen.findByRole("menu")
    await waitFor(async () => {
      await expect(menu).toHaveFocus()
    })

    await userEvent.keyboard("{ArrowDown}")
    const option = screen.getByRole("menuitemradio", { name: "domain" })
    await waitFor(async () => {
      await expect(option).toHaveFocus()
    })

    // The unfocused row reads `none`, so this is the ring and nothing else.
    await expect(getComputedStyle(option).boxShadow).not.toBe("none")
  },
}

// The trigger draws the same one ring. It is reached with a real Tab rather
// than `.focus()`, because the ring is bound to `:focus-visible` and a
// programmatic focus does not reliably match it.
//
// The menu stays closed here — this story is about the trigger, and every
// other story that opens one moves focus into the popup.
export const TheTriggerDrawsTheRing: Story = {
  play: async () => {
    await userEvent.tab()
    const trigger = screen.getByRole("button", { name: TRIGGER })
    await expect(trigger).toHaveFocus()

    // The unfocused trigger reads `none`, so this is the ring and nothing else.
    await expect(getComputedStyle(trigger).boxShadow).not.toBe("none")
  },
}

export const EscapeCloses: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await userEvent.keyboard("{Escape}")

    await waitFor(async () => {
      await expect(screen.queryByRole("menu")).toBeNull()
    })
  },
}
