import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const orgId = user.organizationId;

    const employees = await prisma.employee.findMany({
      where: {
        ...(orgId ? { organizationId: orgId } : {}),
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
      where: orgId ? { organizationId: orgId } : {},
      orderBy: { name: "asc" },
    });

    const offices = await prisma.office.findMany({
      where: orgId ? { branch: { organizationId: orgId } } : {},
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: employees, departments, offices });
  } catch (error) {
    console.error("Employees GET error:", error);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json({ error: "Unauthorized. Organization access required." }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const orgId = currentUser.organizationId;

    // 1-Click Seed Sample Team Action
    if (action === "seed_sample") {
      // Ensure departments exist
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

      // Ensure office exists
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

      // Check if current user has employee record; if not, create one!
      const currentAdminEmp = await prisma.employee.findUnique({ where: { userId: currentUser.id } });
      if (!currentAdminEmp) {
        await prisma.employee.create({
          data: {
            userId: currentUser.id,
            organizationId: orgId,
            departmentId: deptMgmt.id,
            officeId: office.id,
            employeeCode: "EMP-1001",
            designation: "Founder & Executive Director",
            phone: currentUser.phone || "+91 98000 11111",
            status: "AVAILABLE",
            autoApproveVisitors: true,
          },
        });
      }

      // Add 3 more realistic workplace employees
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

      const defaultPasswordHash = await hashPassword("admin123");

      for (const member of sampleTeam) {
        let memberUser = await prisma.user.findUnique({ where: { email: member.email } });
        if (!memberUser) {
          memberUser = await prisma.user.create({
            data: {
              email: member.email,
              name: member.name,
              passwordHash: defaultPasswordHash,
              role: "EMPLOYEE",
              organizationId: orgId,
              phone: member.phone,
              isEmailVerified: true,
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
        message: "Sample workplace host team initialized successfully!",
      });
    }

    // Normal Single Employee Creation
    const { name, email, phone, designation, departmentId, departmentName, officeId, employeeCode, role, autoApproveVisitors } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Employee name and email are required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if email already in use
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "An employee or user with this email already exists." }, { status: 409 });
    }

    // Department resolution (or create new if typed)
    let finalDeptId = departmentId;
    if (!finalDeptId && departmentName) {
      const code = departmentName.slice(0, 4).toUpperCase();
      const newDept = await prisma.department.create({
        data: {
          name: departmentName,
          code,
          organizationId: orgId,
        },
      });
      finalDeptId = newDept.id;
    }

    // Office resolution
    let finalOfficeId = officeId;
    if (!finalOfficeId) {
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

    // Auto-generate employee code if missing
    let finalCode = employeeCode?.trim();
    if (!finalCode) {
      const count = await prisma.employee.count({ where: { organizationId: orgId } });
      finalCode = `EMP-${(1001 + count).toString()}`;
    }

    const defaultPasswordHash = await hashPassword("admin123");

    // Create User record
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash: defaultPasswordHash,
        role: role || "EMPLOYEE",
        phone: phone?.trim() || null,
        organizationId: orgId,
        isEmailVerified: true,
      },
    });

    // Create Employee record
    const newEmployee = await prisma.employee.create({
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
      },
      include: {
        user: true,
        department: true,
        office: true,
      },
    });

    // Record Audit Log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: currentUser.id,
        action: "CREATE_EMPLOYEE",
        entity: "EMPLOYEE",
        entityId: newEmployee.id,
        details: `Added new host employee: ${newEmployee.user.name} (${newEmployee.employeeCode})`,
      },
    });

    return NextResponse.json({
      success: true,
      data: newEmployee,
      message: `Employee ${newEmployee.user.name} created successfully! (Default password: admin123)`,
    });
  } catch (error: any) {
    console.error("Employee creation error:", error);
    return NextResponse.json({ error: error.message || "Failed to create employee" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, designation, phone, departmentId, status, autoApproveVisitors } = body;

    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(designation !== undefined ? { designation } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(autoApproveVisitors !== undefined ? { autoApproveVisitors: Boolean(autoApproveVisitors) } : {}),
      },
      include: {
        user: true,
        department: true,
        office: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Employee update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update employee" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const emp = await prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!emp || emp.organizationId !== currentUser.organizationId) {
      return NextResponse.json({ error: "Employee not found in your organization" }, { status: 404 });
    }

    // Cannot delete yourself
    if (emp.userId === currentUser.id) {
      return NextResponse.json({ error: "You cannot remove your own active administrator profile." }, { status: 400 });
    }

    await prisma.employee.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Employee removed successfully." });
  } catch (error: any) {
    console.error("Employee delete error:", error);
    return NextResponse.json({ error: error.message || "Failed to remove employee" }, { status: 500 });
  }
}
