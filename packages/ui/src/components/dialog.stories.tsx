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

// ── Fullscreen, and the tree/code splitter ───────────────────────────────
//
// The output preview's code pane is ~60 characters at 760px, which is narrow
// enough that generated source wraps and stops looking like the file it claims
// to be. Fullscreen is the answer; the splitter is the answer to the tension
// underneath it — long paths and long code lines competing for one width. Free
// window resizing was built and rejected: nobody wants 812px, they want MORE.

const FULLSCREEN = "Fullscreen"
const SPLITTER = "Resize the file tree"

// A split sheet at rest, with both controls the preview adds.
export const SplitWithFullscreen: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent className="w-[47.5rem]">
        <DialogHeader
          title="Output preview"
          subtitle="~/.claude-src/config.ts · new"
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

// Sized against the sheet's own inset on all four edges rather than by a width:
// `calc(100vw - 48px)` pushed the footer, and with it the only Close button,
// off the bottom of the screen.
export const Fullscreen: Story = {
  ...SplitWithFullscreen,
  render: (args) => (
    <Dialog {...args}>
      <DialogContent fullscreen className="w-[47.5rem]">
        <DialogHeader
          title="Output preview"
          subtitle="~/.claude-src/config.ts · new"
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

// The control names the ACTION rather than the state, so the name changes with
// it — and a dialog that cannot be maximised draws no control at all, which is
// why the handler rather than a boolean is what summons it.
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

    await expect(getComputedStyle(maximise).boxShadow).not.toBe("none")
  },
}

// A separator that reports the width it moves. Without a value it is a landmark
// saying nothing about the thing it controls.
export const SplitterReportsItsWidth: Story = {
  ...SplitWithFullscreen,
  play: async () => {
    await screen.findByRole("dialog", { name: "Output preview" })

    await expect(
      screen.getByRole("separator", { name: SPLITTER })
    ).toHaveAttribute("aria-valuenow", "250")
  },
}
