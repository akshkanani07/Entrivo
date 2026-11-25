import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    office: { findFirst: vi.fn() },
    musterPoint: { updateMany: vi.fn(), findFirst: vi.fn() },
  },
  authorizeMuster: vi.fn(),
  auditMusterAction: vi.fn(),
  musterErrorResponse: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/app/api/muster/_helpers", () => ({
  authorizeMuster: mocks.authorizeMuster,
  auditMusterAction: mocks.auditMusterAction,
  musterErrorResponse: mocks.musterErrorResponse,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { PATCH } from "@/app/api/muster/points/[id]/route";

describe("Muster point office changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMuster.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      clientIp: "127.0.0.1",
    });
  });

  it("rejects an office outside the caller's organization before updating the point", async () => {
    mocks.prisma.office.findFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("https://entrivo.example/api/muster/points/point-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ officeId: "office-from-another-org" }),
      }),
      { params: Promise.resolve({ id: "point-1" }) }
    );
    if (!response) throw new Error("Expected the route to return a response.");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "officeNotFound",
    });
    expect(mocks.prisma.office.findFirst).toHaveBeenCalledWith({
      where: {
        id: "office-from-another-org",
        branch: { organizationId: "org-1" },
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(mocks.prisma.musterPoint.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an empty officeId through the Zod patch schema", async () => {
    const response = await PATCH(
      new Request("https://entrivo.example/api/muster/points/point-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ officeId: "" }),
      }),
      { params: Promise.resolve({ id: "point-1" }) }
    );
    if (!response) throw new Error("Expected the route to return a response.");

    expect(response.status).toBe(400);
    expect(mocks.prisma.office.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.musterPoint.updateMany).not.toHaveBeenCalled();
  });
});
