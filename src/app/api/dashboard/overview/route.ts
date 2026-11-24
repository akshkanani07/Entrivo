import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildSetupChecklist } from "@/lib/setup-checklist";
import { getRedisConnection } from "@/lib/queue";

const querySchema = z.object({
  branchId: z.string().trim().min(1).max(64).optional(),
});

export async function GET(request: Request) {
  const auth = await requirePermission("dashboard.view");
  if (auth.response) return auth.response;

  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;

  const limit = checkRateLimit(`dashboard-overview:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many dashboard requests." }, { status: 429 });
  }

  const parsed = querySchema.safeParse({
    branchId: new URL(request.url).searchParams.get("branchId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid dashboard filters." }, { status: 400 });
  }

  const branchId = parsed.data.branchId;
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Branch not found." }, { status: 404 });
    }
  }

  try {
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        address: true,
        contactEmail: true,
        timezone: true,
      },
    });
    if (!organization) {
      return NextResponse.json({ success: false, error: "Organization not found." }, { status: 404 });
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const nextThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const role = auth.user.role;
    const isEmployee = role === "EMPLOYEE";
    const isAdmin = role === "ORG_ADMIN" || role === "SUPER_ADMIN";

    const employee = isEmployee
      ? await prisma.employee.findFirst({
          where: { userId: auth.user.id, organizationId, deletedAt: null },
          select: { id: true },
        })
      : null;
    const employeeId = employee?.id;
    const employeeScope = isEmployee ? { hostEmployeeId: employeeId || "__never_match__" } : {};
    const branchScope = branchId ? { hostEmployee: { office: { branchId } } } : {};
    const checkInScope = {
      visitor: { organizationId, deletedAt: null },
      ...employeeScope,
      ...(branchId ? { hostEmployee: { office: { branchId } } } : {}),
    };
    const invitationScope = {
      organizationId,
      deletedAt: null,
      ...employeeScope,
      ...branchScope,
    };
    const activeEmergencyScope = {
      organizationId,
      status: "ACTIVE" as const,
      ...(branchId ? { branchId } : {}),
    };

    const [
      activeVisitorCount,
      activeVisitors,
      arrivalsSoon,
      upcomingInvitations,
      timeline,
      pendingApprovalsCount,
      pendingApprovals,
      pendingSelfCheckIns,
      deliveriesWaiting,
      occupiedParking,
      totalParkingSlots,
      expiringDocuments,
      overdueVisitors,
      blacklistHits,
      failedNotificationsAttention,
      activeEmergency,
      unaccountedPersons,
      visitorCount,
      invitationCount,
      checkInCount,
      feedback,
    ] = await Promise.all([
      prisma.checkIn.count({
        where: { ...checkInScope, status: { in: ["CHECKED_IN", "OVERSTAYED"] } },
      }),
      prisma.checkIn.findMany({
        where: { ...checkInScope, status: { in: ["CHECKED_IN", "OVERSTAYED"] } },
        select: {
          id: true,
          checkInTime: true,
          expectedCheckout: true,
          status: true,
          badgeNumber: true,
          visitor: {
            select: {
              id: true,
              name: true,
              company: true,
              visitorType: { select: { name: true, badgeColor: true } },
            },
          },
          hostEmployee: { select: { user: { select: { name: true } } } },
        },
        orderBy: { checkInTime: "asc" },
        take: 8,
      }),
      prisma.invitation.findMany({
        where: {
          ...invitationScope,
          scheduledDate: { gte: startOfToday, lte: nextThreeHours },
          status: { in: ["APPROVED", "PENDING"] },
        },
        select: {
          id: true,
          scheduledDate: true,
          startTime: true,
          status: true,
          visitor: { select: { name: true, company: true } },
          hostEmployee: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        take: 8,
      }),
      prisma.invitation.findMany({
        where: {
          ...invitationScope,
          scheduledDate: { gte: startOfToday, lte: new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000) },
          status: { in: ["APPROVED", "PENDING"] },
        },
        select: {
          id: true,
          scheduledDate: true,
          startTime: true,
          endTime: true,
          status: true,
          purpose: true,
          visitor: { select: { name: true, company: true } },
          hostEmployee: { select: { user: { select: { name: true } } } },
          meetingRoom: { select: { name: true } },
        },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        take: 8,
      }),
      prisma.checkIn.findMany({
        where: {
          ...checkInScope,
          checkInTime: { gte: startOfToday },
        },
        select: {
          id: true,
          checkInTime: true,
          status: true,
          visitor: { select: { name: true, company: true } },
          hostEmployee: { select: { user: { select: { name: true } } } },
        },
        orderBy: { checkInTime: "desc" },
        take: 8,
      }),
      prisma.approval.count({
        where: {
          status: "PENDING",
          invitation: { organizationId, deletedAt: null, ...branchScope, ...employeeScope },
          ...(isEmployee ? { approverId: employeeId || "__never_match__" } : {}),
        },
      }),
      isEmployee && employeeId
        ? prisma.approval.findMany({
            where: {
              approverId: employeeId,
              status: "PENDING",
              invitation: { organizationId, deletedAt: null, ...branchScope },
            },
            select: {
              id: true,
              invitation: {
                select: {
                  id: true,
                  scheduledDate: true,
                  visitor: { select: { name: true, company: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 5,
          })
        : Promise.resolve([]),
      role === "RECEPTIONIST"
        ? prisma.selfCheckinSession.count({
            where: {
              organizationId,
              status: "AWAITING_CONFIRMATION",
              ...(branchId ? { point: { office: { branchId } } } : {}),
            },
          })
        : Promise.resolve(0),
      role === "RECEPTIONIST"
        ? prisma.delivery.count({
            where: {
              organizationId,
              deletedAt: null,
              status: { in: ["RECEIVED", "NOTIFIED"] },
              ...(branchId ? { recipientEmployee: { office: { branchId } } } : {}),
            },
          })
        : Promise.resolve(0),
      role === "RECEPTIONIST"
        ? prisma.parkingAssignment.count({
            where: {
              organizationId,
              status: "OCCUPIED",
              ...(branchId ? { slot: { lot: { office: { branchId } } } } : {}),
            },
          })
        : Promise.resolve(0),
      role === "RECEPTIONIST"
        ? prisma.parkingSlot.count({
            where: {
              isActive: true,
              lot: { organizationId, isActive: true, ...(branchId ? { office: { branchId } } : {}) },
            },
          })
        : Promise.resolve(0),
      isAdmin
        ? prisma.document.count({
            where: {
              organizationId,
              deletedAt: null,
              OR: [{ contractorCompanyId: { not: null } }, { contractorWorkerId: { not: null } }],
              expiryDate: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
            },
          })
        : Promise.resolve(0),
      prisma.checkIn.count({
        where: {
          ...checkInScope,
          OR: [
            { status: "OVERSTAYED" },
            { status: "CHECKED_IN", expectedCheckout: { lt: now } },
          ],
        },
      }),
      role === "SECURITY_GUARD"
        ? prisma.securityLog.count({
            where: { organizationId, logType: "BLACKLIST_MATCH", createdAt: { gte: startOfToday } },
          })
        : Promise.resolve(0),
      prisma.notification.count({
        where: { organizationId, status: "FAILED", createdAt: { gte: last24Hours } },
      }),
      prisma.emergencyEvent.findFirst({
        where: activeEmergencyScope,
        select: { id: true, message: true, startedAt: true },
        orderBy: { startedAt: "desc" },
      }),
      prisma.musterAccountEntry.count({
        where: {
          status: "UNACCOUNTED",
          emergencyEvent: activeEmergencyScope,
        },
      }),
      prisma.visitor.count({ where: { organizationId, deletedAt: null } }),
      prisma.invitation.count({ where: { organizationId, deletedAt: null } }),
      prisma.checkIn.count({ where: { visitor: { organizationId, deletedAt: null } } }),
      isEmployee && employeeId
        ? prisma.feedbackResponse.aggregate({
            where: {
              organizationId,
              hostEmployeeId: employeeId,
              createdAt: { gte: last30Days },
              ...(branchId ? { branchId } : {}),
            },
            _avg: { npsScore: true },
            _count: { _all: true },
          })
        : Promise.resolve(null),
    ]);

    const setupChecklist = isAdmin
      ? await (async () => {
          const [
            officeCount,
            floorCount,
            zoneCount,
            visitorTypeCount,
            hostCount,
            activeNdaCount,
            recentSuccessfulEmailCount,
            pairedKioskCount,
            selfCheckInPointCount,
            musterPointCount,
          ] = await Promise.all([
            prisma.office.count({
              where: { deletedAt: null, branch: { organizationId } },
            }),
            prisma.floor.count({
              where: { deletedAt: null, office: { branch: { organizationId } } },
            }),
            prisma.zone.count({
              where: { deletedAt: null, floor: { office: { branch: { organizationId } } } },
            }),
            prisma.visitorType.count({ where: { organizationId, deletedAt: null } }),
            prisma.employee.count({
              where: { organizationId, deletedAt: null, user: { isActive: true } },
            }),
            prisma.ndaTemplate.count({ where: { organizationId, isActive: true } }),
            prisma.notification.count({
              where: {
                organizationId,
                channel: "EMAIL",
                status: { in: ["SENT", "OPENED"] },
                createdAt: { gte: last30Days },
              },
            }),
            prisma.kiosk.count({
              where: { organizationId, isActive: true, deviceTokenHash: { not: null } },
            }),
            prisma.selfCheckinPoint.count({
              where: { organizationId, status: "ACTIVE" },
            }),
            prisma.musterPoint.count({ where: { organizationId, isActive: true } }),
          ]);

          return buildSetupChecklist({
            organizationProfile: Boolean(organization.name.trim() && organization.address?.trim() && organization.contactEmail?.trim()),
            timezone: Boolean(organization.timezone.trim()),
            offices: officeCount > 0,
            floors: floorCount > 0,
            zones: zoneCount > 0,
            visitorTypes: visitorTypeCount > 0,
            hosts: hostCount > 0,
            ndaTemplate: activeNdaCount > 0,
            emailChannel: recentSuccessfulEmailCount > 0,
            pairedKiosk: pairedKioskCount > 0,
            selfCheckInPoint: selfCheckInPointCount > 0,
            musterPoints: musterPointCount > 0,
          });
        })()
      : null;

    const [
      notificationWorkerFailures,
      emailFailures,
      webhookFailures,
    ] = isAdmin
      ? await Promise.all([
          prisma.notification.count({
            where: { organizationId, status: "FAILED", createdAt: { gte: last24Hours } },
          }),
          prisma.notification.count({
            where: { organizationId, channel: "EMAIL", status: "FAILED", createdAt: { gte: last24Hours } },
          }),
          prisma.webhookDelivery.count({
            where: { organizationId, status: "FAILED", createdAt: { gte: last24Hours } },
          }),
        ])
      : [0, 0, 0];

    let queueStatus = "Not checked";
    if (isAdmin) {
      const redis = await getRedisConnection();
      if (!redis) {
        queueStatus = "In-process fallback";
      } else {
        try {
          await redis.ping();
          queueStatus = "Redis connected";
        } catch {
          queueStatus = "Redis unavailable";
        }
      }
    }

    const attention = [
      ...(pendingApprovalsCount > 0
        ? [{ key: "approvals", label: "Pending approvals", count: pendingApprovalsCount, href: "/approvals" }]
        : []),
      ...(overdueVisitors > 0
        ? [{ key: "overstays", label: "Overstays", count: overdueVisitors, href: "/visitors?status=OVERSTAYED" }]
        : []),
      ...(expiringDocuments > 0
        ? [{ key: "documents", label: "Expiring contractor documents", count: expiringDocuments, href: "/contractors?filter=expiring" }]
        : []),
      ...(failedNotificationsAttention > 0
        ? [{ key: "notifications", label: "Failed notifications", count: failedNotificationsAttention, href: "/notifications" }]
        : []),
      ...(activeEmergency && unaccountedPersons > 0
        ? [{ key: "muster", label: "People not accounted for", count: unaccountedPersons, href: "/muster" }]
        : []),
    ];

    return NextResponse.json({
      success: true,
      data: {
        role,
        branchId: branchId || null,
        activeVisitorCount,
        activeVisitors: activeVisitors.map((item) => ({
          id: item.id,
          checkInTime: item.checkInTime.toISOString(),
          expectedCheckout: item.expectedCheckout?.toISOString() || null,
          isOverstaying: item.status === "OVERSTAYED" || Boolean(item.expectedCheckout && item.expectedCheckout < now),
          badgeNumber: item.badgeNumber,
          visitor: item.visitor,
          hostName: item.hostEmployee.user.name,
        })),
        arrivalsSoon: arrivalsSoon.map((item) => ({
          ...item,
          scheduledDate: item.scheduledDate.toISOString(),
        })),
        upcomingInvitations: upcomingInvitations.map((item) => ({
          ...item,
          scheduledDate: item.scheduledDate.toISOString(),
        })),
        timeline: timeline.map((item) => ({
          ...item,
          checkInTime: item.checkInTime.toISOString(),
        })),
        pendingApprovalsCount,
        pendingApprovals,
        pendingSelfCheckIns,
        deliveriesWaiting,
        parking: { occupied: occupiedParking, total: totalParkingSlots },
        expiringDocuments,
        overdueVisitors,
        blacklistHits,
        activeEmergency: activeEmergency
          ? {
              id: activeEmergency.id,
              message: activeEmergency.message,
              startedAt: activeEmergency.startedAt.toISOString(),
              unaccountedPersons,
            }
          : null,
        attention,
        feedback: feedback
          ? {
              averageScore: Math.round((feedback._avg.npsScore || 0) * 10) / 10,
              responses: feedback._count._all,
            }
          : null,
        setupChecklist,
        isEmptyOrganization: visitorCount === 0 && invitationCount === 0 && checkInCount === 0,
        systemHealth: isAdmin
          ? {
              queue: queueStatus,
              notificationWorkerFailures,
              emailFailures,
              webhookFailures,
            }
          : null,
      },
    });
  } catch (error) {
    console.error(
      "[Dashboard Overview] Failed to load overview:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: "Failed to load dashboard overview." },
      { status: 500 }
    );
  }
}
