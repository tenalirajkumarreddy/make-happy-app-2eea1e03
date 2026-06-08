import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";

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
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: mockUser });
    mockChannelState.currentSubscribeCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a channel with stable name based on user id", () => {
    renderConsumer();
    expect(supabase.channel).toHaveBeenCalledWith("notifications-test-user-123");
  });

  it("does not create a channel when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderConsumer();
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it("removes the channel on unmount", () => {
    const { unmount } = renderConsumer();
    const removeCountBefore = supabase.removeChannel.mock.calls.length;
    unmount();
    expect(supabase.removeChannel.mock.calls.length).toBeGreaterThan(removeCountBefore);
  });

  it("triggers reconnection on CHANNEL_ERROR", () => {
    vi.useFakeTimers();
    renderConsumer();

    const channelsAfterMount = supabase.channel.mock.calls.length;

    expect(mockChannelState.currentSubscribeCallback).not.toBeNull();
    mockChannelState.currentSubscribeCallback!("CHANNEL_ERROR");

    vi.advanceTimersByTime(1000);

    expect(supabase.channel.mock.calls.length).toBeGreaterThan(channelsAfterMount);
    vi.useRealTimers();
  });
});
