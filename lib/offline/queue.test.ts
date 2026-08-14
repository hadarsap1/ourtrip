import { beforeEach, describe, expect, it, vi } from "vitest";

// The queue talks to IndexedDB and to the data layer; both are stubbed so the
// tests exercise the classification logic (audit S-1), which is the part that
// decides whether a write is kept or thrown away.

const store: { rows: Record<string, unknown>[]; nextId: number } = {
  rows: [],
  nextId: 1,
};

const fakeDB = {
  add: vi.fn(async (_store: string, value: Record<string, unknown>) => {
    store.rows.push({ ...value, id: store.nextId++ });
  }),
  getAll: vi.fn(async () => store.rows),
  delete: vi.fn(async (_store: string, id: number) => {
    store.rows = store.rows.filter((r) => r.id !== id);
  }),
  count: vi.fn(async () => store.rows.length),
};

vi.mock("./db", () => ({
  getOfflineDB: () => Promise.resolve(fakeDB),
}));

const createExpense = vi.fn();
const isConnectivityError = vi.fn();
vi.mock("@/lib/data/expenses", () => ({
  createExpense: (...args: unknown[]) => createExpense(...args),
  isConnectivityError: (...args: unknown[]) => isConnectivityError(...args),
}));

const createJournalEntry = vi.fn();
vi.mock("@/lib/data/journal", () => ({
  createJournalEntry: (...args: unknown[]) => createJournalEntry(...args),
}));

const setItemChecked = vi.fn();
vi.mock("@/lib/data/checklists", () => ({
  setItemChecked: (...args: unknown[]) => setItemChecked(...args),
}));

const addPocketExpense = vi.fn();
vi.mock("@/lib/data/pocket", () => ({
  addPocketExpense: (...args: unknown[]) => addPocketExpense(...args),
}));

const updateItem = vi.fn();
vi.mock("@/lib/data/itinerary", () => ({
  updateItem: (...args: unknown[]) => updateItem(...args),
}));

const { countPendingWrites, enqueueWrite, replayPendingWrites, saveOrQueue } =
  await import("./queue");

const JOURNAL = {
  kind: "journal" as const,
  payload: {
    tripId: "t1",
    authorId: "m1",
    body: "היה כיף",
    mood: "🤩",
    locationName: "Lisbon",
  },
};

beforeEach(() => {
  store.rows = [];
  store.nextId = 1;
  vi.clearAllMocks();
  isConnectivityError.mockReturnValue(false);
});

describe("saveOrQueue", () => {
  it("reports 'saved' and queues nothing when the write succeeds", async () => {
    const result = await saveOrQueue(async () => {}, JOURNAL);
    expect(result).toBe("saved");
    expect(await countPendingWrites()).toBe(0);
  });

  it("queues the write when the failure is loss of connectivity", async () => {
    isConnectivityError.mockReturnValue(true);
    const result = await saveOrQueue(async () => {
      throw new Error("failed to fetch");
    }, JOURNAL);
    expect(result).toBe("queued");
    expect(await countPendingWrites()).toBe(1);
  });

  it("rethrows a genuine online failure instead of hiding it in the queue", async () => {
    // An RLS denial must surface — queueing it would replay forever and tell
    // the person their entry was saved when it never can be.
    await expect(
      saveOrQueue(async () => {
        throw new Error("new row violates row-level security policy");
      }, JOURNAL)
    ).rejects.toThrow(/row-level security/);
    expect(await countPendingWrites()).toBe(0);
  });
});

describe("replayPendingWrites", () => {
  it("dispatches every write kind to its own data-layer call", async () => {
    await enqueueWrite(JOURNAL);
    await enqueueWrite({
      kind: "checklist-item",
      payload: { itemId: "i1", checked: true },
    });
    await enqueueWrite({
      kind: "pocket-expense",
      payload: { tripId: "t1", kidId: "k1", amount: 12, description: null },
    });
    await enqueueWrite({
      kind: "itinerary-status",
      payload: { itemId: "it1", status: "done" },
    });
    await enqueueWrite({
      kind: "expense",
      payload: {
        categoryId: "c1",
        amount: 30,
        currency: "EUR",
        description: null,
        spentOn: "2026-08-14",
      },
    });

    const result = await replayPendingWrites();

    expect(result).toEqual({ replayed: 5, dropped: 0 });
    expect(createJournalEntry).toHaveBeenCalledWith(JOURNAL.payload);
    expect(setItemChecked).toHaveBeenCalledWith("i1", true);
    expect(addPocketExpense).toHaveBeenCalledOnce();
    expect(updateItem).toHaveBeenCalledWith("it1", { status: "done" });
    expect(createExpense).toHaveBeenCalledOnce();
    expect(await countPendingWrites()).toBe(0);
  });

  it("keeps a write queued when connectivity drops again mid-replay", async () => {
    isConnectivityError.mockReturnValue(true);
    createJournalEntry.mockRejectedValueOnce(new Error("failed to fetch"));
    await enqueueWrite(JOURNAL);

    expect(await replayPendingWrites()).toEqual({ replayed: 0, dropped: 0 });
    expect(await countPendingWrites()).toBe(1);
  });

  it("drops a permanently-failing write so it cannot block the queue behind it", async () => {
    setItemChecked.mockRejectedValueOnce(new Error("item was deleted"));
    await enqueueWrite({
      kind: "checklist-item",
      payload: { itemId: "gone", checked: true },
    });
    await enqueueWrite(JOURNAL);

    const result = await replayPendingWrites();

    // The journal entry behind the bad entry still lands — head-of-line
    // blocking here would mean losing every later write on the trip.
    expect(result).toEqual({ replayed: 1, dropped: 1 });
    expect(createJournalEntry).toHaveBeenCalledOnce();
    expect(await countPendingWrites()).toBe(0);
  });
});
