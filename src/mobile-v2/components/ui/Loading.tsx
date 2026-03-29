import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "mv2-spinner",
        size === "sm" && "mv2-spinner-sm",
        size === "lg" && "mv2-spinner-lg",
        className
      )}
    />
  );
}

interface LoadingCenterProps {
  className?: string;
}

export function LoadingCenter({ className }: LoadingCenterProps) {
  return (
    <div className={cn("mv2-loading-center", className)}>
      <Spinner />
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  height?: string | number;
  width?: string | number;
}

export function Skeleton({ className, height, width }: SkeletonProps) {
  return (
    <div
      className={cn("mv2-skeleton", className)}
      style={{ height, width }}
    />
  );
}

// Namespace export for Loading.Skeleton, Loading.Spinner patterns
export const Loading = {
  Spinner,
  Skeleton,
  Center: LoadingCenter,
};
