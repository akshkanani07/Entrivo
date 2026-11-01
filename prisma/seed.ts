import { PrismaClient, UserRole, InvitationStatus, CheckInStatus, SecuritySeverity } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Entrivo database seeding...");

  // 1. Clean existing records if any
  await prisma.auditLog.deleteMany({});
  await prisma.securityLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.badge.deleteMany({});
  await prisma.qRCode.deleteMany({});
  await prisma.checkOut.deleteMany({});
  await prisma.checkIn.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.ndaTemplate.deleteMany({});
  await prisma.visitor.deleteMany({});
  await prisma.blacklistVisitor.deleteMany({});
  await prisma.visitorType.deleteMany({});
  await prisma.meetingRoom.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.office.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.notificationTemplate.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.report.deleteMany({});
  await prisma.organization.deleteMany({});

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: "Entrivo Global Tech Park",
      slug: "entrivo-global",
      domain: "entrivo.com",
      address: "Tower 4, Prime Tech Hub, Innovation Boulevard",
      city: "Bengaluru",
      country: "India",
      contactEmail: "concierge@entrivo.com",
      contactPhone: "+91 80 4912 3400",
      checkInPolicy: "All visitors must carry valid photo government ID and wear their physical or digital badge at all times while on company premises.",
      workingHours: "08:30 - 19:30",
    },
  });

  // 3. Create Branches & Offices
  const branchHQ = await prisma.branch.create({
    data: {
      name: "Main Campus - Innovation Hub",
      code: "HQ-01",
      address: "Innovation Blvd, Cyber City",
      organizationId: org.id,
    },
  });

  const branchSkyline = await prisma.branch.create({
    data: {
      name: "Skyline Financial Center",
      code: "SFC-02",
      address: "Financial District, 5th Avenue",
      organizationId: org.id,
    },
  });

  const officeFloor4 = await prisma.office.create({
    data: {
      name: "Level 4 - Executive & Boardroom Suite",
      floor: "4th Floor",
      building: "Tower Alpha",
      branchId: branchHQ.id,
    },
  });

  const officeFloor6 = await prisma.office.create({
    data: {
      name: "Level 6 - Engineering & AI Labs",
      floor: "6th Floor",
      building: "Tower Alpha",
      branchId: branchHQ.id,
    },
  });

  // 4. Meeting Rooms
  const roomAlpha = await prisma.meetingRoom.create({
    data: {
      name: "Boardroom Alpha",
      floor: "4th Floor",
      capacity: 18,
      amenities: "4K Telepresence, Polycom Studio, Smart Whiteboard",
      officeId: officeFloor4.id,
    },
  });

  const roomApollo = await prisma.meetingRoom.create({
    data: {
      name: "Apollo Innovation Suite",
      floor: "6th Floor",
      capacity: 8,
      amenities: "Dual OLED Monitors, High-speed HDMI Hub, Video Bar",
      officeId: officeFloor6.id,
    },
  });

  const roomZenith = await prisma.meetingRoom.create({
    data: {
      name: "Zenith Huddle Room",
      floor: "6th Floor",
      capacity: 4,
      amenities: "Wireless Casting, Acoustic Paneling",
      officeId: officeFloor6.id,
    },
  });

  // 5. Departments
  const deptEng = await prisma.department.create({
    data: { name: "Engineering & Architecture", code: "ENG", organizationId: org.id },
  });
  const deptPeople = await prisma.department.create({
    data: { name: "People Operations & HR", code: "HR", organizationId: org.id },
  });
  const deptExec = await prisma.department.create({
    data: { name: "Executive Leadership", code: "EXEC", organizationId: org.id },
  });
  const deptSecurity = await prisma.department.create({
    data: { name: "Workplace Safety & Security", code: "SEC", organizationId: org.id },
  });

  // 6. Visitor Types
  const typeGuest = await prisma.visitorType.create({
    data: {
      name: "General Guest",
      description: "Standard daytime visitor",
      badgeColor: "#06b6d4",
      requiresApproval: true,
      requiresEscort: false,
      organizationId: org.id,
    },
  });

  const typeClient = await prisma.visitorType.create({
    data: {
      name: "Enterprise Client",
      description: "Client business discussions & demos",
      badgeColor: "#6366f1",
      requiresApproval: true,
      requiresEscort: false,
      organizationId: org.id,
    },
  });

  const typeCandidate = await prisma.visitorType.create({
    data: {
      name: "Interview Candidate",
      description: "Prospective hire for technical/HR rounds",
      badgeColor: "#10b981",
      requiresApproval: true,
      requiresEscort: true,
      organizationId: org.id,
    },
  });

  const typeVendor = await prisma.visitorType.create({
    data: {
      name: "Vendor & Contractor",
      description: "Third-party service provider & facility maintenance",
      badgeColor: "#f59e0b",
      requiresApproval: true,
      requiresEscort: true,
      requiresNDA: true,
      organizationId: org.id,
    },
  });

  const typeVIP = await prisma.visitorType.create({
    data: {
      name: "VIP / Board Member",
      description: "Executive dignitaries and board members",
      badgeColor: "#8b5cf6",
      requiresApproval: false,
      requiresEscort: true,
      organizationId: org.id,
    },
  });

  // 7. Users & Roles
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(8).toString("hex") + "A1!";
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`\n🔑 [SEED GENERATED PASSWORD]: ${seedPassword}\nUse this password to log in as seed administrators.\n`);
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  // Super Admin
  await prisma.user.create({
    data: {
      email: "superadmin@entrivo.com",
      passwordHash,
      name: "Marcus Vance",
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      phone: "+91 98765 00001",
    },
  });

  // Org Admin
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@entrivo.com",
      passwordHash,
      name: "Elena Rostova",
      role: UserRole.ORG_ADMIN,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 00002",
    },
  });

  // Receptionist
  const receptionistUser = await prisma.user.create({
    data: {
      email: "reception@entrivo.com",
      passwordHash,
      name: "Chloe Dupont",
      role: UserRole.RECEPTIONIST,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 00003",
    },
  });

  // Security Guard
  const securityUser = await prisma.user.create({
    data: {
      email: "security@entrivo.com",
      passwordHash,
      name: "Vikram Rathore",
      role: UserRole.SECURITY_GUARD,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 00004",
    },
  });

  // Host Employee 1 - Alex Morgan (VP Engineering)
  const alexUser = await prisma.user.create({
    data: {
      email: "alex.morgan@entrivo.com",
      passwordHash,
      name: "Alex Morgan",
      role: UserRole.EMPLOYEE,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 11111",
    },
  });
  const alexEmp = await prisma.employee.create({
    data: {
      userId: alexUser.id,
      organizationId: org.id,
      departmentId: deptEng.id,
      officeId: officeFloor6.id,
      employeeCode: "EMP-1001",
      designation: "VP of Engineering",
      phone: "+91 98765 11111",
      status: "AVAILABLE",
      autoApproveVisitors: true,
    },
  });

  // Host Employee 2 - Sarah Jenkins (Director People)
  const sarahUser = await prisma.user.create({
    data: {
      email: "sarah.jenkins@entrivo.com",
      passwordHash,
      name: "Sarah Jenkins",
      role: UserRole.EMPLOYEE,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 22222",
    },
  });
  const sarahEmp = await prisma.employee.create({
    data: {
      userId: sarahUser.id,
      organizationId: org.id,
      departmentId: deptPeople.id,
      officeId: officeFloor4.id,
      employeeCode: "EMP-1002",
      designation: "Director of People & Culture",
      phone: "+91 98765 22222",
      status: "AVAILABLE",
    },
  });

  // Host Employee 3 - David Chen (Head of Product)
  const davidUser = await prisma.user.create({
    data: {
      email: "david.chen@entrivo.com",
      passwordHash,
      name: "David Chen",
      role: UserRole.EMPLOYEE,
      organizationId: org.id,
      isEmailVerified: true,
      phone: "+91 98765 33333",
    },
  });
  const davidEmp = await prisma.employee.create({
    data: {
      userId: davidUser.id,
      organizationId: org.id,
      departmentId: deptExec.id,
      officeId: officeFloor4.id,
      employeeCode: "EMP-1003",
      designation: "Head of Product Strategy",
      phone: "+91 98765 33333",
      status: "AVAILABLE",
    },
  });

  // 8. Sample Visitors
  const visitor1 = await prisma.visitor.create({
    data: {
      name: "Rajesh Sharma",
      email: "rajesh.sharma@apexcorp.com",
      phone: "+91 98200 44551",
      company: "Apex Enterprise Solutions",
      visitorTypeId: typeClient.id,
      organizationId: org.id,
      idProofType: "Aadhaar / National ID",
      idProofNumber: "XXXX-XXXX-9812",
    },
  });

  const visitor2 = await prisma.visitor.create({
    data: {
      name: "Pooja Mehta",
      email: "pooja.mehta@techpartners.io",
      phone: "+91 98330 77112",
      company: "TechPartners Global",
      visitorTypeId: typeCandidate.id,
      organizationId: org.id,
      idProofType: "Passport",
      idProofNumber: "Z9102481",
    },
  });

  const visitor3 = await prisma.visitor.create({
    data: {
      name: "Ethan Wright",
      email: "ethan@cisco-sys.com",
      phone: "+1 415 555 0192",
      company: "Cisco Infrastructure",
      visitorTypeId: typeVendor.id,
      organizationId: org.id,
      idProofType: "Driver License",
      idProofNumber: "DL-CA-99120",
    },
  });

  const visitorVIP = await prisma.visitor.create({
    data: {
      name: "Hon. Anita Desai",
      email: "anita.desai@globalinvest.org",
      phone: "+91 99000 88776",
      company: "Sequoia Global Partners",
      visitorTypeId: typeVIP.id,
      organizationId: org.id,
    },
  });

  // 9. Blacklisted visitor for security test
  await prisma.blacklistVisitor.create({
    data: {
      name: "Karan Singhania",
      phone: "+91 99999 12345",
      email: "karan.s@suspicious.org",
      idProofNumber: "DL-SUSPECT-01",
      reason: "Previous unauthorized access attempt and aggressive behavior towards reception staff.",
      organizationId: org.id,
    },
  });

  // 10. Sample Invitations
  const today = new Date();
  const invitation1 = await prisma.invitation.create({
    data: {
      organizationId: org.id,
      hostEmployeeId: alexEmp.id,
      visitorId: visitor1.id,
      meetingRoomId: roomApollo.id,
      scheduledDate: today,
      startTime: "11:00",
      endTime: "12:30",
      purpose: "Enterprise Cloud Architecture Review & Partnership Demo",
      status: InvitationStatus.APPROVED,
      qrToken: "ENTRIVO-INV-APEX-101",
    },
  });

  const invitation2 = await prisma.invitation.create({
    data: {
      organizationId: org.id,
      hostEmployeeId: sarahEmp.id,
      visitorId: visitor2.id,
      meetingRoomId: roomZenith.id,
      scheduledDate: today,
      startTime: "14:00",
      endTime: "15:00",
      purpose: "Final Executive Interview - Principal Architect Role",
      status: InvitationStatus.APPROVED,
      qrToken: "ENTRIVO-INV-CAND-202",
    },
  });

  const tomorrow = new Date(Date.now() + 86400000);
  await prisma.invitation.create({
    data: {
      organizationId: org.id,
      hostEmployeeId: davidEmp.id,
      visitorId: visitorVIP.id,
      meetingRoomId: roomAlpha.id,
      scheduledDate: tomorrow,
      startTime: "10:30",
      endTime: "12:00",
      purpose: "Board of Advisors Strategic Growth Sync",
      status: InvitationStatus.APPROVED,
      qrToken: "ENTRIVO-INV-VIP-303",
    },
  });

  // 11. Active Checked-in visitor (Rajesh Sharma)
  const checkIn1 = await prisma.checkIn.create({
    data: {
      visitorId: visitor1.id,
      invitationId: invitation1.id,
      hostEmployeeId: alexEmp.id,
      checkInTime: new Date(Date.now() - 3600000), // 1 hour ago
      expectedCheckout: new Date(Date.now() + 5400000),
      badgeNumber: "BADGE-101",
      badgeIssued: true,
      status: CheckInStatus.CHECKED_IN,
      receptionistName: "Chloe Dupont",
      securityGuardName: "Vikram Rathore",
    },
  });

  await prisma.badge.create({
    data: {
      badgeNumber: "BADGE-101",
      visitorId: visitor1.id,
      checkInId: checkIn1.id,
      printCount: 1,
      status: "ACTIVE",
    },
  });

  // 12. Completed Checked-out visitor (Ethan Wright)
  const checkIn2 = await prisma.checkIn.create({
    data: {
      visitorId: visitor3.id,
      hostEmployeeId: alexEmp.id,
      checkInTime: new Date(Date.now() - 14400000), // 4 hours ago
      badgeNumber: "BADGE-098",
      badgeIssued: true,
      status: CheckInStatus.CHECKED_OUT,
      receptionistName: "Chloe Dupont",
      securityGuardName: "Vikram Rathore",
    },
  });

  await prisma.checkOut.create({
    data: {
      checkInId: checkIn2.id,
      checkOutTime: new Date(Date.now() - 7200000), // 2 hours ago
      durationMinutes: 120,
      checkoutMethod: "QR_SCAN",
      exitNotes: "Server rack inspection completed successfully. Badge returned.",
    },
  });

  // 13. Notification Templates
  await prisma.notificationTemplate.create({
    data: {
      organizationId: org.id,
      event: "VISITOR_INVITED",
      channel: "EMAIL",
      subject: "Your Visit Invitation to Entrivo - {{date}}",
      body: "Hello {{visitor_name}},\n\nYou are invited by {{host_name}} for {{purpose}} at {{location}}.\n\nDate: {{date}}\nTime: {{time}}\n\nPlease show your QR Pass at the security gate for instant check-in:\n{{qr_pass_url}}\n\nWarm regards,\nEntrivo Workplace Concierge",
      variables: "visitor_name,host_name,purpose,location,date,time,qr_pass_url",
    },
  });

  await prisma.notificationTemplate.create({
    data: {
      organizationId: org.id,
      event: "VISITOR_ARRIVED",
      channel: "IN_APP",
      subject: "Visitor Arrived",
      body: "Visitor {{visitor_name}} from {{company}} has checked in at reception with Badge #{{badge_number}}.",
      variables: "visitor_name,company,badge_number,location,time",
    },
  });

  await prisma.notificationTemplate.create({
    data: {
      organizationId: org.id,
      event: "VISITOR_ARRIVED",
      channel: "WEB_PUSH",
      subject: "Visitor Arrived",
      body: "Visitor {{visitor_name}} has arrived at the reception desk.",
      variables: "visitor_name,location",
    },
  });

  // 14. Organization Settings
  const defaultSettings = [
    { category: "CHECKIN", key: "REQUIRE_PHOTO", value: "true" },
    { category: "CHECKIN", key: "REQUIRE_SIGNATURE", value: "true" },
    { category: "CHECKIN", key: "AUTO_PRINT_BADGE", value: "true" },
    { category: "SECURITY", key: "BLACKLIST_CHECK_STRICT", value: "true" },
    { category: "SECURITY", key: "SESSION_TIMEOUT_MINUTES", value: "60" },
    { category: "NOTIFICATION", key: "ENABLE_PUSH", value: "true" },
    { category: "NOTIFICATION", key: "ENABLE_MAILJET", value: "true" },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.create({
      data: {
        organizationId: org.id,
        category: s.category,
        key: s.key,
        value: s.value,
      },
    });
  }

  // 15. Security Log Sample
  await prisma.securityLog.create({
    data: {
      organizationId: org.id,
      logType: "ENTRY_VERIFIED",
      description: "Visitor Rajesh Sharma badge issued and gate entry authorized.",
      severity: SecuritySeverity.LOW,
      guardName: "Vikram Rathore",
    },
  });

  // 16. Audit Log Sample
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      action: "ORGANIZATION_INITIALIZATION",
      entity: "ORGANIZATION",
      entityId: org.id,
      details: "Entrivo Global Workplace Enterprise initialized with policies and visitor workflows.",
    },
  });

  // 17. Default NDA Template
  await prisma.ndaTemplate.create({
    data: {
      organizationId: org.id,
      title: "Standard Visitor Non-Disclosure & Confidentiality Agreement",
      version: "1.0",
      validityDays: 365,
      isActive: true,
      content: `### VISITOR NON-DISCLOSURE & FACILITY ACCESS AGREEMENT\n\nThis Agreement is entered into on {{DATE}} between **{{ORGANIZATION_NAME}}** ("Company") and **{{VISITOR_NAME}}** representing **{{COMPANY_NAME}}** ("Visitor").\n\n1. **Confidentiality**: Visitor agrees to maintain complete confidentiality regarding all proprietary, technical, and commercial information observed or disclosed during the visit.\n2. **Facility Rules**: Visitor must wear an assigned Entrivo visitor badge at all times, remain within authorized zones, and adhere to workplace safety standards.\n3. **Photography & Recording**: Photography, audio/video recording, and unauthorized data extraction from screens or servers are strictly prohibited.\n4. **Governing Law**: This Agreement is governed by the Digital Personal Data Protection (DPDP) Act, 2023 and applicable national safety regulations.\n\nBy signing below, Visitor affirms and agrees to all terms set forth herein.`,
    },
  });

  console.log("✅ Entrivo database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
