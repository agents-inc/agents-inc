import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"

import { reportError } from "@/lib/observability/report"

// React offers no hook for this — catching a render error still requires a
// class. It is the only one in the app for that reason.
//
// Without it, a throw anywhere in a derivation unmounts the whole tree and
// leaves a white page: no message, no reload affordance, and nothing reported.
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

    // Reloading is the only honest action offered: the configuration lives in
    // localStorage and survives the crash, which is what the second line
    // exists to say. Anything more would be inventing recovery the app cannot
    // actually perform.
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
