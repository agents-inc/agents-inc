import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import { CommandBlock } from "@workspace/ui/components/command-block"

const INSTALL_COMMAND = "npx agents-inc@latest install"

const meta = {
  title: "Components/CommandBlock",
  component: CommandBlock,
  args: { children: INSTALL_COMMAND },
} satisfies Meta<typeof CommandBlock>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

// The install dialog's block, which the user is expected to copy.
export const Copyable: Story = {
  args: { copyable: true, onClick: fn() },
}

// The `$` is decoration, not content — a screen reader reading this block out
// should say the command, not "dollar sign" first.
export const PromptIsHiddenFromAssistiveTech: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("$")).toHaveAttribute("aria-hidden")
  },
}

// `copyable` buys the affordance, not the copying — the handler is the caller's.
// This is the assertion that a click on the block reaches it.
export const CopyableClickReachesHandler: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText(INSTALL_COMMAND))

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}

// The block is the install dialog's only action, so `copyable` has to put it in
// the tab order — a hover border is a picture of an affordance, not one.
export const CopyableTakesKeyboardFocus: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(
      canvas.getByRole("button", { name: INSTALL_COMMAND })
    ).toHaveFocus()
  },
}

// Enter reaches the caller's `onClick` — the same handler the pointer path
// uses, so the two devices cannot drift into meaning different things.
export const CopyableEnterReachesHandler: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ args }) => {
    await userEvent.tab()
    await userEvent.keyboard("{Enter}")

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}
