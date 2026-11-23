import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assignments: [] as Array<Record<string, any>>,
  candidates: [] as Array<Record<string, any>>,
  lockTail: Promise.resolve(),
  prisma: {
    vehicle: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: state.prisma }));
vi.mock("@/lib/settings-registry", () => ({ getOrgPolicy: vi.fn() }));
vi.mock("@/services/notifications/dispatcher", () => ({ notify: vi.fn() }));

import {
  displayPlateNumber,
  isValidForeignPlateNumber,
  isValidIndianPlateNumber,
  maskPlateNumber,
  getParkingAssignmentTransition,
  normalizePlateNumber,
  preferredParkingSlotType,
} from "@/lib/parking";
import { reserveParkingAssignment } from "@/services/parking/parking.service";

function createTransactionMock() {
  state.prisma.$transaction.mockImplementation(async (callback: (tx: Record<string, any>) => Promise<unknown>) => {
    let unlock: (() => void) | undefined;
    let hasSlotLock = false;
    const tx = {
      parkingSlot: {
        findMany: vi.fn().mockImplementation(async () => state.candidates),
      },
      parkingAssignment: {
        findFirst: vi.fn().mockImplementation(({ where }) =>
          state.assignments.find((assignment) =>
            assignment.slotId === where.slotId &&
            ["RESERVED", "OCCUPIED", "OVERSTAY"].includes(assignment.status) &&
            assignment.reservedFrom < where.reservedFrom.lt &&
            assignment.reservedUntil > where.reservedUntil.gt
          ) ?? null
        ),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const created = { id: `assignment-${state.assignments.length + 1}`, ...data };
          state.assignments.push(created);
          return created;
        }),
      },
      $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        if (!strings.join("").includes('"ParkingSlot"')) return [{ id: "vehicle-1" }];
        if (hasSlotLock) return [{ id: "slot-1" }];
        hasSlotLock = true;
        let release!: () => void;
        const previous = state.lockTail;
        state.lockTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        unlock = release;
        return [{ id: "slot-1" }];
      }),
    };

    try {
      return await callback(tx);
    } finally {
      unlock?.();
    }
  });
}

describe("parking plate helpers", () => {
  it("normalizes plates, validates Indian state and BH-series plates, and accepts foreign formats explicitly", () => {
    expect(normalizePlateNumber(" gj 01-ab 1234 ")).toBe("GJ01AB1234");
    expect(displayPlateNumber("gj 01-ab 1234")).toBe("GJ 01-AB 1234");
    expect(isValidIndianPlateNumber("GJ01AB1234")).toBe(true);
    expect(isValidIndianPlateNumber("22BH1234AA")).toBe(true);
    expect(isValidIndianPlateNumber("22BH1234AA12")).toBe(false);
    expect(isValidIndianPlateNumber("GJ0XAB1234")).toBe(false);
    expect(isValidForeignPlateNumber("CA 7-XYZ")).toBe(true);
    expect(isValidForeignPlateNumber("A")).toBe(false);
    expect(maskPlateNumber("GJ01AB1234")).toBe("***34");
  });

  it("maps vehicle types to the matching slot class", () => {
    expect(preferredParkingSlotType("BIKE")).toBe("BIKE");
    expect(preferredParkingSlotType("EV")).toBe("EV");
    expect(preferredParkingSlotType("OTHER")).toBe("CAR");
  });

  it("allows only valid gate state transitions", () => {
    expect(getParkingAssignmentTransition("ENTRY", "RESERVED")).toBe("OCCUPIED");
    expect(getParkingAssignmentTransition("ENTRY", "OCCUPIED")).toBeNull();
    expect(getParkingAssignmentTransition("EXIT", "OCCUPIED")).toBe("RELEASED");
    expect(getParkingAssignmentTransition("EXIT", "OVERSTAY")).toBe("RELEASED");
    expect(getParkingAssignmentTransition("EXIT", "RESERVED")).toBeNull();
  });
});

describe("parking assignment concurrency", () => {
  beforeEach(() => {
    state.assignments.length = 0;
    state.candidates = [{
      id: "slot-1",
      code: "A-01",
      type: "CAR",
      lot: { name: "Main", officeId: "office-1" },
    }];
    state.lockTail = Promise.resolve();
    vi.clearAllMocks();
    state.prisma.vehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
    createTransactionMock();
  });

  it("allows exactly one of two parallel assignments to claim the last slot", async () => {
    const reservation = {
      organizationId: "org-1",
      vehicleType: "CAR" as const,
      reservedFrom: new Date("2026-11-24T10:00:00.000Z"),
      reservedUntil: new Date("2026-11-24T11:00:00.000Z"),
    };
    const results = await Promise.all([
      reserveParkingAssignment({ ...reservation, vehicleId: "vehicle-1" }),
      reserveParkingAssignment({ ...reservation, vehicleId: "vehicle-2" }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state.assignments).toHaveLength(1);
  });

  it("suggests the next compatible free slot when the first slot is occupied", async () => {
    const reservation = {
      organizationId: "org-1",
      vehicleId: "vehicle-1",
      vehicleType: "CAR" as const,
      reservedFrom: new Date("2026-11-24T10:00:00.000Z"),
      reservedUntil: new Date("2026-11-24T11:00:00.000Z"),
    };
    state.candidates = [
      { id: "slot-1", code: "A-01", type: "CAR", lot: { name: "Main", officeId: "office-1" } },
      { id: "slot-2", code: "A-02", type: "CAR", lot: { name: "Main", officeId: "office-1" } },
    ];
    state.assignments.push({
      slotId: "slot-1",
      status: "RESERVED",
      reservedFrom: new Date("2026-11-24T09:00:00.000Z"),
      reservedUntil: new Date("2026-11-24T12:00:00.000Z"),
    });

    const result = await reserveParkingAssignment(reservation);

    expect(result?.slotId).toBe("slot-2");
  });
});
