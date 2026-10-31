import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createDatabaseSession, validatePasswordStrength, getClientIp } from "@/lib/auth";
import { registerRateLimiter } from "@/lib/rate-limit";

const registerSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  name: z.string().min(2, "Administrator name must be at least 2 characters"),
  email: z.string().email("A valid work email is required"),
  password: z.string().min(10, "Password must be at least 10 characters"),
  phone: z.string().optional(),
  agreeTerms: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    const rateLimit = registerRateLimiter(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many registrations from this network. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid registration data" },
        { status: 400 }
      );
    }

    const { companyName, name, email, password, phone } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    const passwordCheck = validatePasswordStrength(password, cleanEmail);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, error: passwordCheck.error || "Password does not meet complexity requirements." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email address already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 1000);

    // Create organization and default hierarchy in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create organization
      const org = await tx.organization.create({
        data: {
          name: companyName.trim(),
          slug,
          contactEmail: cleanEmail,
          contactPhone: phone?.trim() || null,
        },
      });

      // 2. Create default branch & office
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

      // 3. Create default departments
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

      // 4. Create 8 standard visitor types
      const types = [
        { name: "Guest Visitor", badgeColor: "#06b6d4" },
        { name: "Enterprise Client", badgeColor: "#6366f1" },
        { name: "Vendor / Supplier", badgeColor: "#f59e0b" },
        { name: "Interview Candidate", badgeColor: "#10b981" },
        { name: "Delivery Person", badgeColor: "#64748b" },
        { name: "Contractor", badgeColor: "#ec4899" },
        { name: "Employee Guest", badgeColor: "#3b82f6" },
        { name: "VIP Visitor", badgeColor: "#8b5cf6" },
      ];
      for (const t of types) {
        await tx.visitorType.create({ data: { ...t, organizationId: org.id } });
      }

      // 5. Create Org Admin User
      const user = await tx.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          name: name.trim(),
          role: "ORG_ADMIN",
          phone: phone?.trim() || null,
          organizationId: org.id,
          isEmailVerified: true,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          termsAcceptedAt: new Date(),
          termsVersion: "v1.0",
        },
      });

      // 6. Automatically create Host Employee record for the Admin
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

      // 7. Record Audit Log
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: "ORGANIZATION_REGISTER",
          entity: "ORGANIZATION",
          entityId: org.id,
          details: `Organization ${companyName} registered with Administrator ${name}.`,
          ipAddress: ip,
          userAgent,
        },
      });

      return { org, user };
    });

    const { token } = await createDatabaseSession(result.user.id, {
      device: "Desktop Browser",
      ipAddress: ip,
      userAgent,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        organizationId: result.org.id,
        organizationName: result.org.name,
      },
      message: "Workplace successfully registered",
    });

    response.cookies.set("entrivo_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Register API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register new organization" },
      { status: 500 }
    );
  }
}
