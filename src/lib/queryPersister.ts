import { type PersistedClient, type Persister } from "@tanstack/react-query-persist-client";

export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (_client: PersistedClient) => {},
    restoreClient: async () => undefined,
    removeClient: async () => {},
  };
}
