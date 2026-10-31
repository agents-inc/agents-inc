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

const GROUP_BYS = ["domain", "scope"] as const
type GroupBy = (typeof GROUP_BYS)[number]

// Named for the action: the visible text is the current value.
const TRIGGER = "Group sub-agents"

// `MenuRadioGroup` is controlled by construction, so every story holds the value.
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

// Portalled, so queries go through `screen`.
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

// The tick is `aria-hidden`, so exact-name queries reach the active row.
export const TheActiveOptionIsNamedByItsLabelAlone: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await expect(
      screen.getByRole("menuitemradio", { name: "domain" })
    ).toHaveAccessibleName("domain")
  },
}

// The trigger shows the current value, so `scope ▾` proves the handler ran. A story that closes the
// menu ends once the popup unmounts: Base UI unmounts it a frame after closing, and axe, which runs
// after `play`, flags the focus guards of a popup still closing.
export const PickingReportsTheChoice: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("menu")

    await userEvent.click(screen.getByRole("menuitemradio", { name: "scope" }))

    await expect(
      screen.getByRole("button", { name: TRIGGER })
    ).toHaveTextContent("scope ▾")
    await waitFor(async () => {
      await expect(screen.queryByRole("menu")).toBeNull()
    })
  },
}

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

// Waits between presses: Base UI moves focus into the popup and the highlight in separate effects.
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
    // Closing, so it ends as `PickingReportsTheChoice` does.
    await waitFor(async () => {
      await expect(screen.queryByRole("menu")).toBeNull()
    })
  },
}

export const TabReachesTheTrigger: Story = {
  play: async () => {
    await userEvent.tab()

    await expect(screen.getByRole("button", { name: TRIGGER })).toHaveFocus()
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
