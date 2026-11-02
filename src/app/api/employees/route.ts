import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth";
import { requirePermission, canAssignRole, validateRoleChange } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { emailService } from "@/services/email/mailjet.service";
import { UserRole } from "@/types";
import { getAppUrl } from "@/lib/app-url";
import { requiredString, optionalString, requiredEmail } from "@/lib/zod-helpers";

const createEmployeeSchema = z.object({
  name: requiredString("Employee name is required"),
  email: requiredEmail("A valid work email is required"),
  phone: optionalString(),
  designation: optionalString(),
  departmentId: optionalString(),
  departmentName: optionalString(),
  officeId: optionalString(),
  employeeCode: optionalString(),
  backupApproverId: optionalString(),
  role: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : String(v).trim().toUpperCase()),
    z.enum(["SUPER_ADMIN", "ORG_ADMIN", "RECEPTIONIST", "SECURITY_GUARD", "EMPLOYEE"]).optional()
  ),
  autoApproveVisitors: z.boolean().optional().nullable(),
  action: optionalString(),
});

const updateEmployeeSchema = z.object({
  id: requiredString("Employee ID is required"),
  designation: optionalString(),
  phone: optionalString(),
  departmentId: optionalString(),
  status: optionalString(),
  backupApproverId: optionalString(),
  autoApproveVisitors: z.boolean().optional().nullable(),
  role: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : String(v).trim().toUpperCase()),
    z.enum(["SUPER_ADMIN", "ORG_ADMIN", "RECEPTIONIST", "SECURITY_GUARD", "EMPLOYEE"]).optional()
  ),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("employees.read");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const employees = await prisma.employee.findMany({
      where: {
        organizationId: orgId,
        ...(departmentId ? { departmentId } : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { employeeCode: { contains: search, mode: "insensitive" } },
                { designation: { contains: search, mode: "insensitive" } },
                { user: { name: { contains: search, mode: "insensitive" } } },
                { user: { email: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatar: true, role: true, isActive: true } },
        department: true,
        office: true,
        invitations: { take: 3, orderBy: { scheduledDate: "desc" } },
      },
      orderBy: { employeeCode: "asc" },
    });

    const departments = await prisma.department.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    });

    const offices = await prisma.office.findMany({
      where: { branch: { organizationId: orgId } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: employees, departments, offices });
  } catch (error) {
    console.error("Employees GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch employees" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("employees.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const currentUser = auth.user;
    const appUrl = getAppUrl();

    const body = await request.json().catch(() => null);

    // 1-Click Seed Sample Team Action
    if (body?.action === "seed_sample") {
      let deptMgmt = await prisma.department.findFirst({ where: { organizationId: orgId, code: "MGMT" } });
      if (!deptMgmt) {
        deptMgmt = await prisma.department.create({
          data: { name: "Executive Leadership", code: "MGMT", organizationId: orgId },
        });
      }

      let deptEng = await prisma.department.findFirst({ where: { organizationId: orgId, code: "ENG" } });
      if (!deptEng) {
        deptEng = await prisma.department.create({
          data: { name: "Engineering & Tech", code: "ENG", organizationId: orgId },
        });
      }

      let deptHR = await prisma.department.findFirst({ where: { organizationId: orgId, code: "HR" } });
      if (!deptHR) {
        deptHR = await prisma.department.create({
          data: { name: "People & Talent", code: "HR", organizationId: orgId },
        });
      }

      let deptOps = await prisma.department.findFirst({ where: { organizationId: orgId, code: "OPS" } });
      if (!deptOps) {
        deptOps = await prisma.department.create({
          data: { name: "Operations & Facilities", code: "OPS", organizationId: orgId },
        });
      }

      let branch = await prisma.branch.findFirst({ where: { organizationId: orgId } });
      if (!branch) {
        branch = await prisma.branch.create({
          data: { name: "Headquarters", code: "HQ", organizationId: orgId },
        });
      }

      let office = await prisma.office.findFirst({ where: { branchId: branch.id } });
      if (!office) {
        office = await prisma.office.create({
          data: { name: "Main Campus - Tower A", branchId: branch.id },
        });
      }

      const sampleTeam = [
        {
          name: "Sonia Mehta",
          email: `sonia.mehta@${currentUser.organizationName?.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
          designation: "VP of Product & Engineering",
          code: "EMP-1002",
          deptId: deptEng.id,
          phone: "+91 98221 22334",
          autoApprove: true,
        },
        {
          name: "Rohan Varma",
          email: `rohan.varma@${currentUser.organizationName?.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
          designation: "Head of People & Workplace Culture",
          code: "EMP-1003",
          deptId: deptHR.id,
          phone: "+91 98221 33445",
          autoApprove: false,
        },
        {
          name: "Kavita Rao",
          email: `kavita.rao@${currentUser.organizationName?.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
          designation: "Operations & Facilities Lead",
          code: "EMP-1004",
          deptId: deptOps.id,
          phone: "+91 98221 44556",
          autoApprove: true,
        },
      ];

      for (const member of sampleTeam) {
        let memberUser = await prisma.user.findUnique({ where: { email: member.email } });
        if (!memberUser) {
          const unusablePasswordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
          memberUser = await prisma.user.create({
            data: {
              email: member.email,
              name: member.name,
              passwordHash: unusablePasswordHash,
              role: "EMPLOYEE",
              organizationId: orgId,
              phone: member.phone,
              isEmailVerified: true,
              mustChangePassword: true,
            },
          });

          // Create set-password invite token (48h)
          const rawInviteToken = crypto.randomBytes(32).toString("hex");
          await prisma.passwordResetToken.create({
            data: {
              email: member.email,
              tokenHash: hashToken(rawInviteToken),
              purpose: "INVITE",
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          });
        }

        const existingEmp = await prisma.employee.findUnique({ where: { userId: memberUser.id } });
        if (!existingEmp) {
          await prisma.employee.create({
            data: {
              userId: memberUser.id,
              organizationId: orgId,
              departmentId: member.deptId,
              officeId: office.id,
              employeeCode: member.code,
              designation: member.designation,
              phone: member.phone,
              status: "AVAILABLE",
              autoApproveVisitors: member.autoApprove,
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: "Sample workplace host team initialized successfully with secure invitations sent.",
      });
    }

    // Normal Single Employee Creation
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      phone,
      designation,
      departmentId,
      departmentName,
      officeId,
      employeeCode,
      backupApproverId,
      role = "EMPLOYEE",
      autoApproveVisitors,
    } = parsed.data;

    // Privilege escalation guard: Can caller assign this role?
    if (!canAssignRole(currentUser.role, role as UserRole)) {
      return NextResponse.json(
        { success: false, error: `You do not have permission to assign the role '${role}'.` },
        { status: 403 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An employee or user with this email already exists." },
        { status: 409 }
      );
    }

    // Resolve Department scoped to org
    let finalDeptId = departmentId;
    if (finalDeptId) {
      const dept = await prisma.department.findFirst({ where: { id: finalDeptId, organizationId: orgId } });
      if (!dept) {
        return NextResponse.json({ success: false, error: "Department not found in organization" }, { status: 400 });
      }
    } else if (departmentName) {
      const code = departmentName.slice(0, 4).toUpperCase();
      const newDept = await prisma.department.create({
        data: { name: departmentName, code, organizationId: orgId },
      });
      finalDeptId = newDept.id;
    }

    // Resolve Office scoped to org
    let finalOfficeId = officeId;
    if (finalOfficeId) {
      const office = await prisma.office.findFirst({
        where: { id: finalOfficeId, branch: { organizationId: orgId } },
      });
      if (!office) {
        return NextResponse.json({ success: false, error: "Office not found in organization" }, { status: 400 });
      }
    } else {
      const existingOffice = await prisma.office.findFirst({
        where: { branch: { organizationId: orgId } },
      });
      if (existingOffice) {
        finalOfficeId = existingOffice.id;
      } else {
        const branch = await prisma.branch.create({
          data: { name: "Main Campus", code: "MAIN", organizationId: orgId },
        });
        const off = await prisma.office.create({
          data: { name: "Main Office - Floor 1", branchId: branch.id },
        });
        finalOfficeId = off.id;
      }
    }

    // Auto-generate employee code
    let finalCode = employeeCode?.trim();
    if (!finalCode) {
      const count = await prisma.employee.count({ where: { organizationId: orgId } });
      finalCode = `EMP-${(1001 + count).toString()}`;
    }

    // Generate random unusable password hash
    const unusablePasswordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));

    // Set-password invite token with 48-hour TTL
    const rawInviteToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawInviteToken);
    const inviteExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const { newEmployee } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          passwordHash: unusablePasswordHash,
          role: role as UserRole,
          phone: phone?.trim() || null,
          organizationId: orgId,
          isEmailVerified: true,
          mustChangePassword: true,
        },
      });

      const emp = await tx.employee.create({
        data: {
          userId: newUser.id,
          organizationId: orgId,
          departmentId: finalDeptId || null,
          officeId: finalOfficeId || null,
          employeeCode: finalCode,
          designation: designation?.trim() || "Host Staff",
          phone: phone?.trim() || null,
          status: "AVAILABLE",
          autoApproveVisitors: Boolean(autoApproveVisitors),
          backupApproverId: backupApproverId || null,
        },
        include: {
          user: true,
          department: true,
          office: true,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          email: cleanEmail,
          tokenHash,
          purpose: "INVITE",
          expiresAt: inviteExpiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: currentUser.id,
          action: "CREATE_EMPLOYEE",
          entity: "EMPLOYEE",
          entityId: emp.id,
          details: `Added new host employee: ${emp.user.name} (${emp.employeeCode}) with role ${role}. Invitation dispatched.`,
        },
      });

      return { newEmployee: emp };
    });

    const inviteUrl = `${appUrl}/reset-password?token=${rawInviteToken}`;

    if (
      process.env.NODE_ENV !== "production" ||
      process.env.MAILJET_API_KEY?.startsWith("mock_")
    ) {
      console.log(`\n[SECURE SERVER CONSOLE] Employee Invite Set-Password Link for ${cleanEmail}:\n${inviteUrl}\n`);
    }

    // Send invitation email with set-password link
    await emailService.sendEmail(
      {
        to: cleanEmail,
        recipientName: name,
        subject: `Welcome to Entrivo - Activate Your Workplace Account`,
        htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070b14; color: #f8fafc; padding: 32px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid #1e293b;">
            <div style="margin-bottom: 24px; text-align: center;">
              <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">ENTRIVO</span>
              <p style="font-size: 11px; color: #818cf8; margin-top: 4px; font-weight: 600; text-transform: uppercase;">Workplace Access & Concierge</p>
            </div>
            <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 12px;">Welcome to Entrivo, ${name}!</h2>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
              You have been added as a workplace host at ${currentUser.organizationName || "your company"}. Please set your secure password to activate your account:
            </p>
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 12px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
                Set Password & Activate &rarr;
              </a>
            </div>
            <p style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 16px; margin: 0;">
              This invitation link will expire in 48 hours.
            </p>
          </div>
        `,
        textContent: `Welcome to Entrivo. Activate your account and set your password: ${inviteUrl}\nThis link expires in 48 hours.`,
      },
      currentUser.id
    );

    return NextResponse.json({
      success: true,
      data: newEmployee,
      message: `Employee ${newEmployee.user.name} created successfully and activation invite sent.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create employee";
    console.error("Employee creation error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("employees.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const currentUser = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = updateEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { id, designation, phone, departmentId, status, autoApproveVisitors, role, backupApproverId } = parsed.data;

    // Tenant scoped lookup
    const existing = await prisma.employee.findFirst({
      where: { id, organizationId: orgId },
      include: { user: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Employee not found in organization." }, { status: 404 });
    }

    if (backupApproverId && backupApproverId === id) {
      return NextResponse.json({ success: false, error: "An employee cannot be their own backup approver." }, { status: 400 });
    }

    if (backupApproverId) {
      const backupExists = await prisma.employee.findFirst({
        where: { id: backupApproverId, organizationId: orgId },
      });
      if (!backupExists) {
        return NextResponse.json({ success: false, error: "Backup approver not found in organization." }, { status: 400 });
      }
    }

    // If changing role
    if (role && role !== existing.user.role) {
      const roleCheck = await validateRoleChange(currentUser, existing.userId, role as UserRole, orgId);
      if (!roleCheck.allowed) {
        return NextResponse.json({ success: false, error: roleCheck.error || "Role change not permitted" }, { status: 403 });
      }
      await prisma.user.update({
        where: { id: existing.userId },
        data: { role: role as UserRole },
      });
    }

    // Verify department if updated
    if (departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: departmentId, organizationId: orgId } });
      if (!dept) {
        return NextResponse.json({ success: false, error: "Department not found in organization" }, { status: 400 });
      }
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(designation ? { designation: designation.trim() } : {}),
        ...(phone ? { phone: phone.trim() } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(status ? { status } : {}),
        ...(backupApproverId !== undefined ? { backupApproverId: backupApproverId || null } : {}),
        ...(autoApproveVisitors !== undefined ? { autoApproveVisitors: Boolean(autoApproveVisitors) } : {}),
      },
      include: {
        user: true,
        department: true,
        office: true,
      },
    });

    return NextResponse.json({ success: true, data: updated, message: "Employee updated successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update employee";
    console.error("Employee update error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("employees.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const currentUser = auth.user;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Employee ID is required" }, { status: 400 });
    }

    const emp = await prisma.employee.findFirst({
      where: { id, organizationId: orgId },
      include: { user: true },
    });

    if (!emp) {
      return NextResponse.json({ success: false, error: "Employee not found in your organization" }, { status: 404 });
    }

    // Cannot delete yourself
    if (emp.userId === currentUser.id) {
      return NextResponse.json(
        { success: false, error: "You cannot remove your own active administrator profile." },
        { status: 400 }
      );
    }

    // If target is an ORG_ADMIN, ensure at least one other active ORG_ADMIN remains
    if (emp.user.role === "ORG_ADMIN") {
      const remainingAdmins = await prisma.user.count({
        where: {
          organizationId: orgId,
          role: "ORG_ADMIN",
          isActive: true,
          deletedAt: null,
          id: { not: emp.userId },
        },
      });
      if (remainingAdmins < 1) {
        return NextResponse.json(
          { success: false, error: "Cannot delete the sole remaining organization administrator." },
          { status: 400 }
        );
      }
    }

    await prisma.employee.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: currentUser.id,
        action: "DELETE_EMPLOYEE",
        entity: "EMPLOYEE",
        entityId: emp.id,
        details: `Removed employee record ${emp.user.name} (${emp.employeeCode})`,
      },
    });

    return NextResponse.json({ success: true, message: "Employee removed successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to remove employee";
    console.error("Employee delete error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
