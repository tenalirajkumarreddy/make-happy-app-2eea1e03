import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update before delay", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "hello" } },
    );
    rerender({ val: "world" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("hello");
  });

  it("updates after delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "hello" } },
    );
    rerender({ val: "world" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("world");
  });

  it("resets timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "a" } },
    );
    rerender({ val: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ val: "abc" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("abc");
  });

  it("uses default delay of 300ms", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val),
      { initialProps: { val: "one" } },
    );
    rerender({ val: "two" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("two");
  });
});
