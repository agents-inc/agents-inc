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
  DialogPaneSplitter,
  DialogPanes,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

import { expectVisibleFocusRing } from "../../.storybook/focus-ring"

const TITLE = "Install"
const TRIGGER = "open install"
const INSTALL_COMMAND = "npx agents-inc@latest install --from abc123"

// Portalled, so queries go through `screen`.
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

export const OpensAndTakesFocus: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: TRIGGER }))

    const dialog = await screen.findByRole("dialog", { name: TITLE })

    // Base UI moves focus in an effect.
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

// Axe cannot check focus indicators.
export const CloseGlyphFocusDrawsTheRing: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("dialog", { name: TITLE })
    const close = screen.getByRole("button", { name: "Close" })

    close.focus()

    await expectVisibleFocusRing(close)
  },
}

// Without `aria-label` the `✕` announces as "multiplication x".
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


const FULLSCREEN = "Fullscreen"
const SPLITTER = "Resize the file tree"

export const SplitWithFullscreen: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent className="w-[47.5rem]">
        <DialogHeader
          title="Output preview"
          subtitle="~/.agents-inc/claude/config.ts · new"
          onToggleFullscreen={() => {}}
        />
        <DialogPanes className="min-h-[16rem]">
          <DialogPane side="tree">
            <div className="text-11 text-ink-2">config.ts</div>
          </DialogPane>
          <DialogPaneSplitter width={250} onWidth={() => {}} />
          <DialogPane side="content">
            <div className="font-mono text-11 text-ink-2">
              export const agents = []
            </div>
          </DialogPane>
        </DialogPanes>
        <DialogFooter>
          <DialogClose render={<Button />}>close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

// Inset on all four edges, so the footer's Close button stays on screen.
export const Fullscreen: Story = {
  ...SplitWithFullscreen,
  render: (args) => (
    <Dialog {...args}>
      <DialogContent fullscreen className="w-[47.5rem]">
        <DialogHeader
          title="Output preview"
          subtitle="~/.agents-inc/claude/config.ts · new"
          fullscreen
          onToggleFullscreen={() => {}}
        />
        <DialogBody scroll>
          <div className="font-mono text-11 text-ink-2">
            export const agents = []
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button />}>close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const MaximiseNamesTheAction: Story = {
  ...SplitWithFullscreen,
  play: async () => {
    await screen.findByRole("dialog", { name: "Output preview" })

    await expect(
      screen.getByRole("button", { name: FULLSCREEN })
    ).toHaveAttribute("aria-pressed", "false")
  },
}

export const MaximiseFocusDrawsTheRing: Story = {
  ...SplitWithFullscreen,
  play: async () => {
    await screen.findByRole("dialog", { name: "Output preview" })
    const maximise = screen.getByRole("button", { name: FULLSCREEN })

    maximise.focus()

    await expectVisibleFocusRing(maximise)
  },
}

export const SplitterReportsItsWidth: Story = {
  ...SplitWithFullscreen,
  play: async () => {
    await screen.findByRole("dialog", { name: "Output preview" })

    await expect(
      screen.getByRole("separator", { name: SPLITTER })
    ).toHaveAttribute("aria-valuenow", "250")
  },
}
