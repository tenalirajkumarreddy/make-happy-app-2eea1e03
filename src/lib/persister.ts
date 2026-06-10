import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { isQueryPersisted } from "./persistedQueries";

const APP_PREFIX = "ap";

export function createIndexedDbPersister(): Persister {
  return {
    async persistClient(client: PersistedClient) {
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
    },
    async restoreClient(): Promise<PersistedClient | undefined> {
      return await get<PersistedClient>(APP_PREFIX);
    },
    async removeClient() {
      await del(APP_PREFIX);
    },
  };
}
