import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * React Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Prevents white-screen crashes by displaying a fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error("[ErrorBoundary] Caught unhandled error:", error, errorInfo);
    
    // Update state with error details
    this.setState({ errorInfo });
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // Log to custom logger
    import("@/lib/logger").then(({ logError }) => {
      logError("[ErrorBoundary] Caught unhandled error", error, {
        componentStack: errorInfo.componentStack,
      });
    }).catch((err) => {
      console.error("Failed to load logger module:", err);
    });
    
    // Send to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.handleReset();
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              An unexpected error occurred. Don't worry, your data is safe. You can try again or return to the dashboard.
            </p>
            {this.state.error && (
              <div className="mt-4">
                <p className="rounded bg-muted px-3 py-2 font-mono text-xs text-destructive">
                  {this.state.error.message}
                </p>
                {import.meta.env.DEV && this.state.errorInfo && (
                  <details className="mt-2 text-left">
                    <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                      View component stack (dev only)
                    </summary>
                    <pre className="text-xs mt-2 overflow-auto max-h-48 rounded bg-muted p-2 text-muted-foreground">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button onClick={this.handleGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
