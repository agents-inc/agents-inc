import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"

import { reportError } from "@/lib/observability/report"

// Catching a render error still requires a class; without it a throw leaves a
// white page.
type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack })
  }

  render() {
    if (!this.state.failed) return this.props.children

    // Reload is the only recovery: the configuration survives in localStorage.
    return (
      <main className="grid h-svh place-items-center bg-page">
        <div className="flex flex-col items-center gap-4">
          <p className="font-mono text-11 font-semibold tracking-[.16em] text-brand-ink uppercase">
            Something broke
          </p>
          <p className="max-w-[24rem] text-center text-11 leading-[1.5] text-ink-3">
            Your configuration is saved. Reloading the page should bring it
            back.
          </p>
          <Button variant="outline" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      </main>
    )
  }
}
