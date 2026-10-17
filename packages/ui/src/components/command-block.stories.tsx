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

export const Copyable: Story = {
  args: { copyable: true, onClick: fn() },
}

// The `$` is a `::before`, outside the accessibility tree, selection and `textContent`, so the
// block's text is exactly the command.
export const PromptIsNotPartOfTheCommand: Story = {
  play: async ({ canvasElement }) => {
    const block = canvasElement.querySelector("[data-slot=command-block]")

    await expect(block).toHaveTextContent(INSTALL_COMMAND)
    await expect(block).not.toHaveTextContent("$")
  },
}

// `copyable` buys the affordance; the handler is the caller's.
export const CopyableClickReachesHandler: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText(INSTALL_COMMAND))

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}

export const CopyableTakesKeyboardFocus: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(
      canvas.getByRole("button", { name: INSTALL_COMMAND })
    ).toHaveFocus()
  },
}

export const CopyableEnterReachesHandler: Story = {
  args: { copyable: true, onClick: fn() },
  play: async ({ args }) => {
    await userEvent.tab()
    await userEvent.keyboard("{Enter}")

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}
