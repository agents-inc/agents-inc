import { createToastManager } from "@workspace/ui/components/toast"

// Raised from store actions, outside React; `RootLayout` mounts its Toaster.
export const toastManager = createToastManager()

// What one action says replaces whatever the last one said.
export const sayInToasts = (lines: readonly string[]) => {
  if (lines.length === 0) return

  toastManager.close()
  for (const title of lines) toastManager.add({ title })
}
