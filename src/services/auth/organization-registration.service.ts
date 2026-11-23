import { Prisma } from "@prisma/client";
import { LEGAL_VERSION } from "@/lib/legal";

type LoginProvider = "PASSWORD" | "GOOGLE";

interface OrganizationRegistrationInput {
  companyName: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  ipAddress: string;
  userAgent: string;
  loginProvider: LoginProvider;
  googleId?: string;
  avatarUrl?: string;
  isEmailVerified: boolean;
}

export async function createOrganizationWithAdmin(
  tx: Prisma.TransactionClient,
  input: OrganizationRegistrationInput
) {
  const { companyName, name, email, phone, passwordHash, ipAddress, userAgent } = input;
  const slug =
    companyName.toLowerCase().replace(/[^a-z0-9]/g, "-") +
    "-" +
    Math.floor(Math.random() * 1000);

  const org = await tx.organization.create({
    data: {
      name: companyName.trim(),
      slug,
      contactEmail: email,
      contactPhone: phone?.trim() || null,
    },
  });

  const branch = await tx.branch.create({
    data: {
      name: "Main Campus",
      code: "MAIN",
      organizationId: org.id,
    },
  });

  const office = await tx.office.create({
    data: {
      name: "Main Building - Floor 1",
      branchId: branch.id,
    },
  });

  const deptMgmt = await tx.department.create({
    data: { name: "Executive Leadership", code: "EXEC", organizationId: org.id },
  });
  await tx.department.create({
    data: { name: "Engineering & Tech", code: "ENG", organizationId: org.id },
  });
  await tx.department.create({
    data: { name: "Human Resources", code: "HR", organizationId: org.id },
  });
  await tx.department.create({
    data: { name: "Operations & Facilities", code: "OPS", organizationId: org.id },
  });

  const visitorTypes = [
    { name: "Guest Visitor", badgeColor: "#06b6d4" },
    { name: "Enterprise Client", badgeColor: "#6366f1" },
    { name: "Vendor / Supplier", badgeColor: "#f59e0b" },
    { name: "Interview Candidate", badgeColor: "#10b981" },
    { name: "Delivery Person", badgeColor: "#64748b" },
    { name: "Contractor", badgeColor: "#ec4899" },
    { name: "Employee Guest", badgeColor: "#3b82f6" },
    { name: "VIP Visitor", badgeColor: "#8b5cf6" },
  ];
  for (const visitorType of visitorTypes) {
    await tx.visitorType.create({ data: { ...visitorType, organizationId: org.id } });
  }

  const user = await tx.user.create({
    data: {
      email,
      passwordHash,
      name: name.trim(),
      role: "ORG_ADMIN",
      phone: phone?.trim() || null,
      organizationId: org.id,
      isEmailVerified: input.isEmailVerified,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_VERSION,
      googleId: input.googleId,
      avatarUrl: input.avatarUrl,
      lastLoginProvider: input.loginProvider,
    },
  });

  await tx.employee.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      departmentId: deptMgmt.id,
      officeId: office.id,
      employeeCode: "EMP-1001",
      designation: "Founder & Workplace Director",
      phone: phone?.trim() || null,
      status: "AVAILABLE",
      autoApproveVisitors: true,
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: "ORGANIZATION_REGISTER",
      entity: "ORGANIZATION",
      entityId: org.id,
      details: `Organization ${companyName} registered with Administrator ${name}.`,
      ipAddress,
      userAgent,
    },
  });

  return { org, user };
}
