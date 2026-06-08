import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNotifications } from "@/hooks/useNotifications";

// Hoisted state for mock factories (needed because vi.mock factories are hoisted)
const mockChannelState = vi.hoisted(() => ({
  currentSubscribeCallback: null as ((status: string) => void) | null,
}));

// Mock auth
const mockUser = { id: "test-user-123" };
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { schedule: vi.fn() } }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    checkPermissions: vi.fn(() => ({ receive: "granted" })),
    register: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// Mock supabase client — tracks channel operations
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        mockChannelState.currentSubscribeCallback = cb || null;
        return "test-channel-id";
      }),
    })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

// Minimal component that uses the hook
function TestConsumer() {
  useNotifications();
  return null;
}

function renderConsumer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestConsumer />
    </QueryClientProvider>
  );
}

describe("useNotifications channel lifecycle", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: mockUser });
    mockChannelState.currentSubscribeCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a channel with stable name based on user id", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    renderConsumer();
    expect(supabase.channel).toHaveBeenCalledWith("notifications-test-user-123");
  });

  it("removes the channel on unmount", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { unmount } = renderConsumer();
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it("triggers reconnection on CHANNEL_ERROR", async () => {
    vi.useFakeTimers();
    const { supabase } = await import("@/integrations/supabase/client");
    renderConsumer();

    // Simulate CHANNEL_ERROR
    expect(mockChannelState.currentSubscribeCallback).not.toBeNull();
    mockChannelState.currentSubscribeCallback!("CHANNEL_ERROR");

    // Advance timer by 1s (first backoff delay 2^0 * 1000)
    vi.advanceTimersByTime(1000);

    // Initial render creates channel twice (line 126 + setupChannel at line 132),
    // reconnect creates a third channel — total 3
    expect(supabase.channel).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
