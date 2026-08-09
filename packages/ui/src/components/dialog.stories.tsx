import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, screen, userEvent, waitFor } from "storybook/test"

import { Button } from "@workspace/ui/components/button"
import { CommandBlock } from "@workspace/ui/components/command-block"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneHeading,
  DialogPanes,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

const TITLE = "Install"
const TRIGGER = "open install"
const INSTALL_COMMAND = "npx agents-inc@latest install --from abc123"

// The dialog is portalled, so everything here is queried from `screen` rather
// than from the story canvas.
const meta = {
  title: "Components/Dialog",
  component: Dialog,
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger>{TRIGGER}</DialogTrigger>
      <DialogContent>
        <DialogHeader title={TITLE} subtitle="12 skills · 4 sub-agents" />
        <DialogBody>
          <CommandBlock copyable>{INSTALL_COMMAND}</CommandBlock>
        </DialogBody>
        <DialogFooter>
          <DialogFooterNote>click to copy</DialogFooterNote>
          <DialogClose render={<Button />}>close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { defaultOpen: true },
}

// The install dialog's two-column inventory, on the wider sheet.
export const WideWithPanes: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent wide>
        <DialogHeader title={TITLE} subtitle="12 skills · 4 sub-agents" />
        <DialogPanes>
          <DialogPane>
            <DialogPaneHeading>skills</DialogPaneHeading>
            <div className="text-11 text-ink-2">
              react · typescript · vitest
            </div>
          </DialogPane>
          <DialogPane side="right">
            <DialogPaneHeading>sub-agents</DialogPaneHeading>
            <div className="text-11 text-ink-2">web-developer · web-tester</div>
          </DialogPane>
        </DialogPanes>
        <DialogFooter>
          <DialogClose render={<Button />}>close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

// Opening has to do two things at once: put a dialog on screen that announces
// what it is, and move focus into it — a modal the keyboard is still outside of
// is not modal.
export const OpensAndTakesFocus: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: TRIGGER }))

    const dialog = await screen.findByRole("dialog", { name: TITLE })

    // Base UI moves focus in an effect, so this is a wait rather than a read.
    await waitFor(async () => {
      await expect(dialog.contains(document.activeElement)).toBe(true)
    })
  },
}

export const EscapeCloses: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("dialog", { name: TITLE })

    await userEvent.keyboard("{Escape}")

    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull()
    })
  },
}

// The ✕ is a button like every other one the package ships, so it draws the
// same focus ring. Axe cannot check a focus indicator — it is not
// machine-decidable — so this is the only thing holding the glyph to it.
export const CloseGlyphFocusDrawsTheRing: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("dialog", { name: TITLE })
    const close = screen.getByRole("button", { name: "Close" })

    close.focus()

    await expect(getComputedStyle(close).boxShadow).not.toBe("none")
  },
}

// `✕` is a text glyph rather than an icon, so its accessible name is an
// explicit `aria-label` — without one it would announce as "multiplication x".
export const CloseGlyphCloses: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("dialog", { name: TITLE })

    await userEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull()
    })
  },
}
