import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory pending_writes store with IndexedDB's async shape.
const store = new Map<number, Record<string, unknown>>();
const fakeDb = {
  getAll: async () => [...store.values()],
  delete: async (_s: string, id: number) => void store.delete(id),
  put: async (_s: string, v: { id: number }) => void store.set(v.id, v),
  add: async () => {},
};
vi.mock("./db", () => ({ getOfflineDB: () => Promise.resolve(fakeDb) }));

const createExpense = vi.fn(async () => {
  // a real insert takes a round trip; the other replays start meanwhile
  await new Promise((r) => setTimeout(r, 10));
});
vi.mock("@/lib/data/expenses", () => ({
  createExpense,
  isConnectivityError: () => false,
}));

import { replayPendingWrites } from "./queue";

describe("replayPendingWrites", () => {
  beforeEach(() => {
    store.clear();
    createExpense.mockClear();
    store.set(1, {
      id: 1,
      kind: "expense",
      createdAt: "2026-11-02T03:00:00Z",
      payload: { categoryId: "c", amount: 77777, currency: "VND", description: null, spentOn: "2026-11-02" },
    });
  });

  // online + focus + visibilitychange fire together when signal returns
  it("saves an offline expense once when replays are triggered together", async () => {
    const results = await Promise.all([replayPendingWrites(), replayPendingWrites(), replayPendingWrites()]);
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(results[0].replayed).toBe(1);
    expect(store.size).toBe(0);
  });

  it("runs again once the previous replay has finished", async () => {
    await replayPendingWrites();
    store.set(2, { ...store.get(1), id: 2, kind: "expense", payload: { categoryId: "c", amount: 5, currency: "USD" } });
    await replayPendingWrites();
    expect(createExpense).toHaveBeenCalledTimes(2);
  });
});
