import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered instead of the default panel when provided. */
  fallback?: ReactNode
  /** Remounts the boundary when this value changes (e.g. the route path). */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken subtree does not blank the whole app.
 *
 * React only routes errors here from rendering, lifecycle methods and
 * constructors. Errors thrown in event handlers or async callbacks never reach a
 * boundary — those still need their own try/catch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prevProps: Props) {
    // Navigating away should clear a stale error rather than pinning the panel.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Kept as console output so it reaches whatever aggregator is wired up.
    console.error('Unhandled render error:', error, errorInfo.componentStack)
  }

  private handleReset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div role="alert" className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section failed to load. The rest of the app is still usable.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}

          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/dashboard')}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
