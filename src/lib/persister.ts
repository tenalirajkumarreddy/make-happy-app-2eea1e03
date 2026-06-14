import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { isQueryPersisted } from "./persistedQueries";

const APP_PREFIX = "ap";
const PERSIST_DEBOUNCE_MS = 5_000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingClient: PersistedClient | null = null;

function debouncedPersist(client: PersistedClient, doPersist: (c: PersistedClient) => Promise<void>) {
  pendingClient = client;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (pendingClient) {
      doPersist(pendingClient);
      pendingClient = null;
    }
  }, PERSIST_DEBOUNCE_MS);
}

export function createIndexedDbPersister(): Persister {
  const doPersist = async (client: PersistedClient) => {
    const filtered: PersistedClient = {
      ...client,
      clientState: {
        ...client.clientState,
        queries: client.clientState.queries.filter((q) =>
          isQueryPersisted(q.queryKey),
        ),
      },
    };
    await set(APP_PREFIX, filtered);
  };

  return {
    async persistClient(client: PersistedClient) {
      debouncedPersist(client, doPersist);
    },
    async restoreClient(): Promise<PersistedClient | undefined> {
      if (persistTimer) {
        clearTimeout(persistTimer);
        if (pendingClient) {
          await doPersist(pendingClient);
          pendingClient = null;
        }
      }
      return await get<PersistedClient>(APP_PREFIX);
    },
    async removeClient() {
      if (persistTimer) clearTimeout(persistTimer);
      pendingClient = null;
      await del(APP_PREFIX);
    },
  };
}
