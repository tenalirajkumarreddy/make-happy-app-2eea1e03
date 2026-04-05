import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { logError } from "@/lib/logger";

interface Props {
  children: ReactNode;
  /** Human-readable name of the page/section for logging */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-route error boundary that catches render errors in individual pages
 * without taking down the entire application router.
 *
 * Usage:
 *   <RouteErrorBoundary pageName="Sales">
 *     <Sales />
 *   </RouteErrorBoundary>
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`[RouteErrorBoundary:${this.props.pageName ?? "unknown"}] Unhandled error`, error, {
      componentStack: info.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">
              {this.props.pageName
                ? `Error loading ${this.props.pageName}`
                : "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              This page encountered an error. The rest of the app is still working — you can retry
              or go back.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <pre className="mt-3 rounded bg-muted p-3 text-left font-mono text-xs text-muted-foreground max-w-lg overflow-x-auto whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleGoBack} size="sm">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Go back
            </Button>
            <Button onClick={this.handleRetry} size="sm">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
