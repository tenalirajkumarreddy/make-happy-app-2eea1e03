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
      onError={(error, errorInfo) => {
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

/**
 * Sales route error boundary
 */
export function SalesErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary routeName="sales">
      {children}
    </RouteErrorBoundary>
  );
}

/**
 * Inventory route error boundary
 */
export function InventoryErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary routeName="inventory">
      {children}
    </RouteErrorBoundary>
  );
}

/**
 * Customers route error boundary
 */
export function CustomersErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary routeName="customers">
      {children}
    </RouteErrorBoundary>
  );
}

/**
 * Reports route error boundary
 */
export function ReportsErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary routeName="reports">
      {children}
    </RouteErrorBoundary>
  );
}

/**
 * Settings route error boundary
 */
export function SettingsErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary routeName="settings">
      {children}
    </RouteErrorBoundary>
  );
}

export default RouteErrorBoundary;
