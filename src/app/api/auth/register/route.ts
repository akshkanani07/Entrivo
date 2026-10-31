import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createDatabaseSession, validatePasswordStrength } from "@/lib/auth";
import { registerRateLimiter } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    const rateLimit = registerRateLimiter(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many registrations from this IP. Please try again later." }, { status: 429 });
    }

    const { name, email, password, companyName, phone } = await request.json();

    if (!name || !email || !password || !companyName) {
      return NextResponse.json({ error: "All required fields must be provided" }, { status: 400 });
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return NextResponse.json({ error: "An account with this email address already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 1000);

    // Create organization
    const org = await prisma.organization.create({
      data: {
        name: companyName,
        slug,
        contactEmail: cleanEmail,
        contactPhone: phone,
      },
    });

    // Create default branch & office
    const branch = await prisma.branch.create({
      data: {
        name: "Main Campus",
        code: "MAIN",
        organizationId: org.id,
      },
    });

    const office = await prisma.office.create({
      data: {
        name: "Main Building - Floor 1",
        branchId: branch.id,
      },
    });

    // Create default departments
    const deptMgmt = await prisma.department.create({
      data: { name: "Executive Leadership", code: "EXEC", organizationId: org.id },
    });
    await prisma.department.create({
      data: { name: "Engineering & Tech", code: "ENG", organizationId: org.id },
    });
    await prisma.department.create({
      data: { name: "Human Resources", code: "HR", organizationId: org.id },
    });
    await prisma.department.create({
      data: { name: "Operations & Facilities", code: "OPS", organizationId: org.id },
    });

    // Create 8 standard visitor types
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
      await prisma.visitorType.create({ data: { ...t, organizationId: org.id } });
    }

    // Create Org Admin User
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        name,
        role: "ORG_ADMIN",
        phone,
        organizationId: org.id,
        isEmailVerified: true,
      },
    });

    // Automatically create Host Employee record for the Admin
    await prisma.employee.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        departmentId: deptMgmt.id,
        officeId: office.id,
        employeeCode: "EMP-1001",
        designation: "Founder & Workplace Director",
        phone,
        status: "AVAILABLE",
        autoApproveVisitors: true,
      },
    });

    const { token } = await createDatabaseSession(user.id, {
      device: "Desktop / Browser",
      ipAddress: ip,
      userAgent,
    });

    // Audit Log
    await prisma.auditLog.create({
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

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: org.id,
        organizationName: org.name,
      },
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
    return NextResponse.json({ error: "Failed to register new organization" }, { status: 500 });
  }
}
