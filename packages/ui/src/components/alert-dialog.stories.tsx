import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"

const TITLE = "Switch to Full stack?"
const TRIGGER = "switch stack"
const CANCEL = "Keep my setup"
const CONFIRM = "Switch"

// The one use is the stack switch, where the cost of a stray click is the
// user's whole selection. Portalled, so queries come from `screen`.
const meta = {
  title: "Components/AlertDialog",
  component: AlertDialog,
  args: { onOpenChange: fn() },
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger>{TRIGGER}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader title={TITLE} />
        <AlertDialogDescription>
          You have changes that do not come from a stack. Switching replaces
          your current setup, discarding 12 selected skills, their options and
          their sub-agent assignments.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{CANCEL}</AlertDialogCancel>
          <AlertDialogAction>{CONFIRM}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
} satisfies Meta<typeof AlertDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { defaultOpen: true },
}

export const OpensAndTakesFocus: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: TRIGGER }))

    const dialog = await screen.findByRole("alertdialog", { name: TITLE })

    // Base UI moves focus in an effect, so this is a wait rather than a read.
    await waitFor(async () => {
      await expect(dialog.contains(document.activeElement)).toBe(true)
    })
  },
}

export const CancelCloses: Story = {
  args: { defaultOpen: true },
  play: async () => {
    await screen.findByRole("alertdialog", { name: TITLE })

    await userEvent.click(screen.getByRole("button", { name: CANCEL }))

    await waitFor(async () => {
      await expect(screen.queryByRole("alertdialog")).toBeNull()
    })
  },
}

// The difference from `Dialog`, and the reason this component exists at all:
// a stray click on the backdrop must not discard the user's selection.
export const BackdropDoesNotClose: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const dialog = await screen.findByRole("alertdialog", { name: TITLE })

    await userEvent.click(document.body)

    await expect(dialog).toBeVisible()
  },
}
