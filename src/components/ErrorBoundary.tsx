import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Global React Error Boundary.
 * Catches unhandled rendering errors in the client tree, logs them safely to
 * the console, and presents a calm, Vapor-native recovery screen. Internal
 * component stacks and file paths are never exposed to the user.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[client:uncaught_error]", error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.hash = "#/"
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="relative flex min-h-svh flex-col items-center justify-center px-6 text-center">
          <div className="mx-auto flex w-full max-w-md flex-col items-center">
            <p
              role="status"
              className="font-mono text-xs uppercase tracking-[0.25em] text-fog-dim"
            >
              SIGNAL DISRUPTED
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-breath">
              An unexpected error occurred.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-fog">
              Nothing was saved, and nothing lingers. Reload to return to the gate.
            </p>
            <div className="mt-8">
              <Button onClick={this.handleReload}>Return to gate</Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
