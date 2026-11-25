import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    emergencyEvent: { findFirst: vi.fn() },
    musterAccountEntry: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    musterAccountAction: { findFirst: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn() },
    musterPoint: { findFirst: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
      emergencyEvent: { findFirst: vi.fn() },
      musterAccountEntry: { findFirst: vi.fn() },
      musterAccountAction: { findFirst: vi.fn() },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { MusterServiceError, accountMusterEntry } from "@/services/muster/muster.service";

const version = "2026-01-01T00:00:00.123Z";
const staleVersion = "2025-12-31T23:59:59.999Z";

function createEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    status: "UNACCOUNTED",
    updatedAt: new Date(version),
    accountedAt: null,
    accountedById: null,
    accountedBy: null,
    ...overrides,
  };
}

function createInput(expectedUpdatedAt?: string) {
  return {
    organizationId: "org-1",
    eventId: "event-1",
    entryId: "entry-1",
    actorId: "user-1",
    clientEventId: "client-event-0001",
    status: "SAFE",
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    offlineIdentity: { actorUserId: "user-1", organizationId: "org-1" },
  };
}

function configureActiveTransaction({
  replay = null,
  entry = createEntry(),
}: {
  replay?: ReturnType<typeof createEntry> | null;
  entry?: ReturnType<typeof createEntry>;
} = {}) {
  mocks.tx.emergencyEvent.findFirst.mockResolvedValue({
    id: "event-1",
    status: "ACTIVE",
    officeId: null,
    branchId: null,
  });
  mocks.tx.musterAccountEntry.findFirst.mockImplementation(
    async (args: { where: Record<string, unknown> }) =>
      "clientEventId" in args.where ? replay : entry,
  );
  mocks.tx.musterAccountAction.findFirst.mockResolvedValue(null);
  mocks.tx.user.findFirst.mockResolvedValue({ id: "user-1" });
  mocks.tx.musterAccountEntry.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.musterAccountEntry.findFirstOrThrow.mockResolvedValue({
    ...entry,
    status: "SAFE",
    clientEventId: "client-event-0001",
  });
  mocks.tx.musterAccountEntry.update.mockResolvedValue({
    ...entry,
    status: "SAFE",
    clientEventId: "client-event-0001",
  });
  mocks.tx.musterAccountAction.create.mockResolvedValue({});
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
  );
}

describe("offline muster entry version precondition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates atomically when the roster version matches", async () => {
    configureActiveTransaction();

    await accountMusterEntry(createInput(version));

    expect(mocks.tx.musterAccountEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: "entry-1",
        emergencyEventId: "event-1",
        updatedAt: new Date(version),
      },
      data: expect.objectContaining({ status: "SAFE", clientEventId: "client-event-0001" }),
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
  });

  it("returns current status details when the roster version is stale", async () => {
    configureActiveTransaction({
      entry: createEntry({
        status: "MISSING",
        updatedAt: new Date(version),
        accountedAt: new Date(version),
        accountedById: "user-2",
        accountedBy: { name: "Responder" },
      }),
    });

    const request = accountMusterEntry(createInput(staleVersion));

    await expect(request).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      current: {
        status: "MISSING",
        accountedAt: version,
        accountedByName: "Responder",
      },
    } satisfies Partial<MusterServiceError>);
    expect(mocks.tx.musterAccountEntry.updateMany).not.toHaveBeenCalled();
  });

  it("returns an idempotent replay before checking a stale version", async () => {
    const replay = createEntry({
      status: "SAFE",
      clientEventId: "client-event-0001",
    });
    configureActiveTransaction({ replay });

    await expect(accountMusterEntry(createInput(staleVersion))).resolves.toBe(replay);

    expect(mocks.tx.musterAccountEntry.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.tx.musterAccountEntry.updateMany).not.toHaveBeenCalled();
  });

  it("keeps legacy requests without a version precondition on the existing update path", async () => {
    configureActiveTransaction();

    await accountMusterEntry(createInput());

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.tx.musterAccountEntry.update).toHaveBeenCalled();
    expect(mocks.tx.musterAccountEntry.updateMany).not.toHaveBeenCalled();
  });
});
