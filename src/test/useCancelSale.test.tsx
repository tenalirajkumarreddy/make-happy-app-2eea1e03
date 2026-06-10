import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCancelSale } from "@/hooks/useCancelSale";

const mockRpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));

vi.mock("@/lib/mutationHelpers", () => ({
  afterSaleCancelled: vi.fn(),
}));

const mockSale = { id: "sale-1", display_id: "SALE001", total_amount: 1000 };

function TestCancelSale() {
  const {
    handleCancel, setCancelSale, cancelSale,
    cancelRestockTarget, setCancelRestockTarget,
    cancelSelectedAgentId, setCancelSelectedAgentId,
    isCancellingSale,
  } = useCancelSale();

  return (
    <div>
      <button data-testid="set-sale" onClick={() => setCancelSale(mockSale)} />
      <button data-testid="to-warehouse" onClick={() => setCancelRestockTarget("warehouse")} />
      <button data-testid="set-agent-id" onClick={() => setCancelSelectedAgentId("agent-1")} />
      <button data-testid="handle-cancel" onClick={handleCancel} />
      <span data-testid="sale-id">{cancelSale?.id || "none"}</span>
      <span data-testid="restock-target">{cancelRestockTarget}</span>
      <span data-testid="agent-id">{cancelSelectedAgentId || "none"}</span>
      <span data-testid="is-pending">{isCancellingSale ? "true" : "false"}</span>
    </div>
  );
}

function renderWithQc() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["sales"], [{ id: "sale-1", display_id: "SALE001", total_amount: 1000 }]);
  render(<QueryClientProvider client={qc}><TestCancelSale /></QueryClientProvider>);
  return qc;
}

describe("useCancelSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
  });

  it("sets sale state on click", async () => {
    renderWithQc();
    expect(screen.getByTestId("sale-id").textContent).toBe("none");
    await userEvent.click(screen.getByTestId("set-sale"));
    expect(screen.getByTestId("sale-id").textContent).toBe("sale-1");
  });

  it("calls admin_cancel_sale RPC with warehouse restock", async () => {
    mockRpc.mockResolvedValue({ error: null });
    renderWithQc();

    await userEvent.click(screen.getByTestId("set-sale"));
    await userEvent.click(screen.getByTestId("to-warehouse"));
    await userEvent.click(screen.getByTestId("handle-cancel"));

    await vi.waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("admin_cancel_sale", {
        p_sale_id: "sale-1",
        p_restock_user_id: null,
      });
    });
  });

  it("calls RPC with agent id for agent restock", async () => {
    mockRpc.mockResolvedValue({ error: null });
    renderWithQc();

    await userEvent.click(screen.getByTestId("set-sale"));
    await userEvent.click(screen.getByTestId("set-agent-id"));
    await userEvent.click(screen.getByTestId("handle-cancel"));

    await vi.waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("admin_cancel_sale", {
        p_sale_id: "sale-1",
        p_restock_user_id: "agent-1",
      });
    });
  });

  it("removes sale from cache optimistically on mutate", async () => {
    mockRpc.mockImplementation(() => new Promise(() => {}));
    const qc = renderWithQc();

    await userEvent.click(screen.getByTestId("set-sale"));
    await userEvent.click(screen.getByTestId("to-warehouse"));
    await userEvent.click(screen.getByTestId("handle-cancel"));

    // onMutate runs synchronously before mutationFn — sale should be removed from cache
    const data = qc.getQueryData(["sales"]) as any[];
    expect(data?.find((s: any) => s.id === "sale-1")).toBeUndefined();
  });

  it("restores sale in cache on RPC error", async () => {
    mockRpc.mockRejectedValue(new Error("DB error"));
    const qc = renderWithQc();

    await userEvent.click(screen.getByTestId("set-sale"));
    await userEvent.click(screen.getByTestId("to-warehouse"));
    await userEvent.click(screen.getByTestId("handle-cancel"));

    await vi.waitFor(() => {
      const data = qc.getQueryData(["sales"]) as any[];
      expect(data?.find((s: any) => s.id === "sale-1")).toBeDefined();
    });
  });

  it("shows pending state while mutation is in flight", async () => {
    mockRpc.mockImplementation(() => new Promise(() => {}));
    renderWithQc();

    await userEvent.click(screen.getByTestId("set-sale"));
    await userEvent.click(screen.getByTestId("to-warehouse"));

    // isPending should be false before mutation
    expect(screen.getByTestId("is-pending").textContent).toBe("false");

    await userEvent.click(screen.getByTestId("handle-cancel"));

    // isPending should be true after mutation starts (onMutate is sync)
    expect(screen.getByTestId("is-pending").textContent).toBe("true");
  });
});
