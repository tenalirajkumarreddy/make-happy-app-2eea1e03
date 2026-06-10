/**
 * Route-level error boundary wrapper
 * Provides error boundaries for different sections of the app
 */

import { ErrorBoundary } from "./ErrorBoundary";
import { ReactNode } from "react";
import { logError } from "@/lib/logger";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName: string;
  fallback?: ReactNode;
}

/**
 * Route-level error boundary with automatic error logging
 */
export function RouteErrorBoundary({
  children,
  routeName,
  fallback,
}: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={fallback}
      onError={(error: any, errorInfo) => {
        logError(error, {
          context: `RouteErrorBoundary:${routeName}`,
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default RouteErrorBoundary;
