import { describe, it, expect } from "vitest";
import { createIndexedDbPersister } from "@/lib/persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

describe("createIndexedDbPersister", () => {
  const persister = createIndexedDbPersister();
  const mockClient: PersistedClient = {
    timestamp: Date.now(),
    buster: "v1",
    clientState: {
      queries: [
        {
          queryKey: ["sales"],
          state: {
            data: [{ id: 1 }],
            dataUpdateCount: 1,
            dataUpdatedAt: Date.now(),
          },
        },
      ],
      mutations: [],
    },
  };

  it("persists and restores a client", async () => {
    await persister.persistClient(mockClient);
    const restored = await persister.restoreClient();
    expect(restored).toEqual(mockClient);
  });

  it("removes a persisted client", async () => {
    await persister.persistClient(mockClient);
    await persister.removeClient();
    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
  });

  it("returns undefined when nothing persisted", async () => {
    await persister.removeClient();
    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
  });

  it("filters out non-allowlisted queries before persisting", async () => {
    const mixedClient: PersistedClient = {
      timestamp: Date.now(),
      buster: "v1",
      clientState: {
        queries: [
          {
            queryKey: ["sales"],
            state: {
              data: [{ id: 1 }],
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
            },
          },
          {
            queryKey: ["mobile-agent-sales-today"],
            state: {
              data: [],
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
            },
          },
          {
            queryKey: ["analytics"],
            state: {
              data: {},
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
            },
          },
        ],
        mutations: [],
      },
    };
    await persister.persistClient(mixedClient);
    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();
    expect(restored!.clientState.queries).toHaveLength(1);
    expect(restored!.clientState.queries[0].queryKey).toEqual(["sales"]);
  });
});
