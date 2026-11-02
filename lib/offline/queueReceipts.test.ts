import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory pending_writes / failed_writes with IndexedDB's async shape.
const pending = new Map<number, Record<string, unknown>>();
const failed: Record<string, unknown>[] = [];
const fakeDb = {
  getAll: async () => [...pending.values()],
  delete: async (_s: string, id: number) => void pending.delete(id),
  put: async (_s: string, v: { id: number }) => void pending.set(v.id, v),
  add: async (_s: string, v: Record<string, unknown>) => void failed.push(v),
};
vi.mock("./db", () => ({ getOfflineDB: () => Promise.resolve(fakeDb) }));

const calls: string[] = [];
let expenseFails = false;
const createExpense = vi.fn(async (p: { id?: string }) => {
  if (expenseFails) throw new Error("fetch failed");
  calls.push(`expense:${p.id}`);
});
const uploadReceipt = vi.fn(async (p: { id: string }) => {
  calls.push(`receipt:${p.id}`);
});
vi.mock("@/lib/data/expenses", () => ({
  createExpense,
  isConnectivityError: (e: unknown) => e instanceof Error && e.message.includes("fetch"),
}));
vi.mock("@/lib/data/receipts", () => ({ uploadReceipt }));

import { replayPendingWrites } from "./queue";

const blob = new Blob(["x"], { type: "image/jpeg" });

describe("replaying receipts taken offline", () => {
  beforeEach(() => {
    pending.clear();
    failed.length = 0;
    calls.length = 0;
    expenseFails = false;
    pending.set(1, {
      id: 1,
      kind: "expense",
      createdAt: "2026-11-02T03:00:00Z",
      payload: { id: "e1", categoryId: "c", amount: 1000, currency: "ILS", description: null, spentOn: "2026-11-02" },
    });
    pending.set(2, {
      id: 2,
      kind: "receipt",
      createdAt: "2026-11-02T03:00:01Z",
      payload: { id: "r1", tripId: "t", expenseId: "e1", blob, mime: "image/jpeg" },
    });
  });

  it("uploads the receipt after its expense", async () => {
    const result = await replayPendingWrites(true);
    expect(calls).toEqual(["expense:e1", "receipt:r1"]);
    expect(result.replayed).toBe(2);
    expect(pending.size).toBe(0);
  });

  it("keeps the receipt waiting while its expense backs off", async () => {
    expenseFails = true;
    await replayPendingWrites(true);
    expect(uploadReceipt).not.toHaveBeenCalled();
    expect(pending.size).toBe(2);
    expect(failed).toHaveLength(0);

    expenseFails = false;
    await replayPendingWrites(true);
    expect(calls).toEqual(["expense:e1", "receipt:r1"]);
    expect(pending.size).toBe(0);
  });
});
