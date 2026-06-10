import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

function TestSentinel({
  loadMore, hasMore, isFetching,
}: {
  loadMore: () => void; hasMore: boolean; isFetching: boolean;
}) {
  const ref = useInfiniteScroll(loadMore, hasMore, isFetching);
  return <div data-testid="sentinel" ref={ref} />;
}

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a sentinel element", () => {
    const loadMore = vi.fn();
    const { getByTestId } = render(
      <TestSentinel loadMore={loadMore} hasMore={true} isFetching={false} />
    );
    expect(getByTestId("sentinel")).toBeInTheDocument();
  });

  it("returns a stable ref across renders", () => {
    const loadMore = vi.fn();
    const { getByTestId, rerender } = render(
      <TestSentinel loadMore={loadMore} hasMore={true} isFetching={false} />
    );
    const sentinel1 = getByTestId("sentinel");

    rerender(<TestSentinel loadMore={loadMore} hasMore={true} isFetching={true} />);
    const sentinel2 = getByTestId("sentinel");

    expect(sentinel1).toBe(sentinel2);
  });

  it("does not call loadMore when hasMore is false", () => {
    const loadMore = vi.fn();
    render(<TestSentinel loadMore={loadMore} hasMore={false} isFetching={false} />);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("does not call loadMore when isFetching is true", () => {
    const loadMore = vi.fn();
    render(<TestSentinel loadMore={loadMore} hasMore={true} isFetching={true} />);
    expect(loadMore).not.toHaveBeenCalled();
  });
});
