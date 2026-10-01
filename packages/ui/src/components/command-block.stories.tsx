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
// should say the command, not "dollar sign" first, and a reader copying the
// line should get the command and nothing else.
//
// ASSERTED AS AN ABSENCE FROM THE BLOCK'S TEXT, because that is what the
// mechanism became. It was a `<span aria-hidden>$</span>` and this story read
// `getByText("$")` and checked the attribute; the prompt is a generated
// `::before` now, so there is no element to find and the story went red naming
// a missing ELEMENT rather than a missing behaviour. A `::before` is outside
// the accessibility tree, outside a selection and outside `textContent` alike,
// so the one honest statement covering all three is that the block's text IS
// the command — and it is the assertion that still means something if the
// decoration ever comes back as an element.
export const PromptIsNotPartOfTheCommand: Story = {
  play: async ({ canvasElement }) => {
    const block = canvasElement.querySelector("[data-slot=command-block]")

    await expect(block).toHaveTextContent(INSTALL_COMMAND)
    await expect(block).not.toHaveTextContent("$")
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
