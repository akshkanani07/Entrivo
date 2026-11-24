import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";
import { assertE2EDatabaseUrl } from "./e2e-safety";

const organizationId = "e2e-7a-organization";
const branchId = "e2e-7a-branch";
const officeId = "e2e-7a-office";
const visitorTypeId = "e2e-7a-visitor-type";
const visitorId = "e2e-7a-visitor";
const invitationId = "e2e-7a-invitation";

export default async function globalSetup() {
  if (process.env.E2E !== "1") return;
  assertE2EDatabaseUrl(process.env.DATABASE_URL);

  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: process.env });
  const prisma = new PrismaClient();
  const accounts: Array<{ key: string; email: string; name: string; role: UserRole; employeeCode: string }> = [
    { key: "ADMIN", email: "e2e-admin@entrivo.test", name: "E2E Organization Admin", role: "ORG_ADMIN", employeeCode: "E2E-ADMIN" },
    { key: "RECEPTIONIST", email: "e2e-receptionist@entrivo.test", name: "E2E Receptionist", role: "RECEPTIONIST", employeeCode: "E2E-RECEPTION" },
    { key: "GUARD", email: "e2e-guard@entrivo.test", name: "E2E Security Guard", role: "SECURITY_GUARD", employeeCode: "E2E-GUARD" },
    { key: "EMPLOYEE", email: "e2e-employee@entrivo.test", name: "E2E Employee", role: "EMPLOYEE", employeeCode: "E2E-EMPLOYEE" },
  ];

  const employeeIds: Record<string, string> = {};
  try {
    await prisma.organization.upsert({
      where: { slug: "entrivo-e2e-7a" },
      update: { name: "Entrivo 7a E2E Organization", timezone: "UTC", deletedAt: null },
      create: {
        id: organizationId,
        name: "Entrivo 7a E2E Organization",
        slug: "entrivo-e2e-7a",
        timezone: "UTC",
        locale: "en-US",
      },
    });
    await prisma.branch.upsert({
      where: { id: branchId },
      update: { name: "E2E Branch", code: "E2E", organizationId, deletedAt: null },
      create: { id: branchId, name: "E2E Branch", code: "E2E", organizationId },
    });
    await prisma.office.upsert({
      where: { id: officeId },
      update: { name: "E2E Reception", branchId, deletedAt: null },
      create: { id: officeId, name: "E2E Reception", branchId },
    });
    await prisma.visitorType.upsert({
      where: { id: visitorTypeId },
      update: { name: "E2E Guest", organizationId, requiresApproval: true, requiresNDA: false, deletedAt: null },
      create: {
        id: visitorTypeId,
        name: "E2E Guest",
        organizationId,
        requiresApproval: true,
        requiresNDA: false,
      },
    });

    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId, key: "policy_walkinApprovalMode" } },
      update: { value: "REQUIRE_HOST", category: "SECURITY_POLICY" },
      create: {
        organizationId,
        key: "policy_walkinApprovalMode",
        value: "REQUIRE_HOST",
        category: "SECURITY_POLICY",
      },
    });

    for (const account of accounts) {
      const password = `${randomBytes(32).toString("hex")}Aa1!`;
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.upsert({
        where: { email: account.email },
        update: {
          name: account.name,
          passwordHash,
          role: account.role,
          organizationId,
          isEmailVerified: true,
          isActive: true,
          mustChangePassword: false,
          deletedAt: null,
        },
        create: {
          email: account.email,
          name: account.name,
          passwordHash,
          role: account.role,
          organizationId,
          isEmailVerified: true,
          isActive: true,
          mustChangePassword: false,
        },
        select: { id: true },
      });

      const employee = await prisma.employee.upsert({
        where: { userId: user.id },
        update: {
          organizationId,
          officeId,
          employeeCode: account.employeeCode,
          designation: account.role,
          status: "AVAILABLE",
          deletedAt: null,
        },
        create: {
          userId: user.id,
          organizationId,
          officeId,
          employeeCode: account.employeeCode,
          designation: account.role,
        },
      });
      employeeIds[account.key] = employee.id;

      process.env[`E2E_${account.key}_EMAIL`] = account.email;
      process.env[`E2E_${account.key}_PASSWORD`] = password;
    }

    await prisma.visitor.upsert({
      where: { id: visitorId },
      update: {
        name: "E2E Sample Visitor",
        email: "e2e-visitor@entrivo.test",
        phone: "5550100100",
        company: "E2E Sample Company",
        organizationId,
        visitorTypeId,
        deletedAt: null,
      },
      create: {
        id: visitorId,
        name: "E2E Sample Visitor",
        email: "e2e-visitor@entrivo.test",
        phone: "5550100100",
        company: "E2E Sample Company",
        organizationId,
        visitorTypeId,
      },
    });

    await prisma.invitation.upsert({
      where: { id: invitationId },
      update: {
        organizationId,
        hostEmployeeId: employeeIds.EMPLOYEE,
        visitorId,
        scheduledDate: new Date(),
        purpose: "E2E profile and lifecycle smoke test",
        status: "APPROVED",
        qrToken: "e2e-7a-invitation-qr-token",
        isWalkIn: false,
        deletedAt: null,
      },
      create: {
        id: invitationId,
        organizationId,
        hostEmployeeId: employeeIds.EMPLOYEE,
        visitorId,
        scheduledDate: new Date(),
        purpose: "E2E profile and lifecycle smoke test",
        status: "APPROVED",
        qrToken: "e2e-7a-invitation-qr-token",
      },
    });

    process.env.E2E_ORG_ID = organizationId;
    process.env.E2E_VISITOR_ID = visitorId;
    process.env.E2E_INVITATION_ID = invitationId;
  } finally {
    await prisma.$disconnect();
  }
}
