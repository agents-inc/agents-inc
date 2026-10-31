import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { expect, screen, userEvent, waitFor } from "storybook/test"

import {
  Toaster,
  createToastManager,
  type ToastManager,
} from "@workspace/ui/components/toast"

const MESSAGE = "web tester switched off: Tailwind CSS removed"
const LONG_MESSAGE =
  "web developer, web researcher, web tester and 5 more switched on: React and Hono added"

// Rendered after the `Toaster`, whose provider subscribes in an effect that runs first. A fixed
// id, so a second mount updates the toast rather than adding one.
function RaisedOnMount({
  manager,
  title,
}: {
  manager: ToastManager
  title: string
}) {
  useEffect(() => {
    manager.add({ id: "story", title, timeout: 0 })
  }, [manager, title])

  return null
}

// Inset: the test browser applies no `layout`, so a story draws at the top-left corner, where its
// pointer rests. A toast drawn under the pointer is hovered as it arrives, which shows the `✕`.
function ToastOnScreen({ title }: { title: string }) {
  const [manager] = useState(createToastManager)

  return (
    <div className="p-6">
      <Toaster manager={manager} />
      <RaisedOnMount manager={manager} title={title} />
    </div>
  )
}

const meta = {
  title: "Components/Toast",
  component: ToastOnScreen,
  args: { title: MESSAGE },
} satisfies Meta<typeof ToastOnScreen>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WrapsALongMessage: Story = {
  args: { title: LONG_MESSAGE },
}

export const NamedByItsMessage: Story = {
  play: async () => {
    await expect(
      await screen.findByRole("dialog", { name: MESSAGE })
    ).toBeInTheDocument()
  },
}

// Base UI's viewport is the polite live region, so a screen reader reads the toast out.
export const SitsInThePoliteNotificationsRegion: Story = {
  play: async () => {
    await screen.findByRole("dialog", { name: MESSAGE })

    await expect(
      screen.getByRole("region", { name: "Notifications" })
    ).toHaveAttribute("aria-live", "polite")
  },
}

// Base UI keeps the `✕` out of the accessibility tree until the toasts are hovered or focused, so
// the live region reads the message alone.
export const CloseGlyphHiddenUntilHovered: Story = {
  play: async () => {
    const toast = await screen.findByRole("dialog", { name: MESSAGE })
    await expect(screen.queryByRole("button", { name: "Close" })).toBeNull()

    await userEvent.hover(toast)

    await expect(
      await screen.findByRole("button", { name: "Close" })
    ).toBeInTheDocument()
  },
}

export const CloseGlyphCloses: Story = {
  play: async () => {
    await userEvent.hover(await screen.findByRole("dialog", { name: MESSAGE }))

    await userEvent.click(await screen.findByRole("button", { name: "Close" }))

    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull()
    })
  },
}
