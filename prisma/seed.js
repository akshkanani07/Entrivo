const { PrismaClient, UserRole, InvitationStatus, CheckInStatus, SecuritySeverity } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Entrivo Enterprise Database Seeding...");

  // 1. Create Organization
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

  // 2. Branches & Offices
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

  // 3. Meeting Rooms
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

  // 4. Departments
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

  // 5. All 8 Visitor Types
  const visitorTypesData = [
    { name: "Guest Visitor", badgeColor: "#06b6d4", description: "Standard daytime visitor", requiresApproval: true, requiresEscort: false, requiresNDA: false },
    { name: "Enterprise Client", badgeColor: "#6366f1", description: "Client meeting & contract discussion", requiresApproval: true, requiresEscort: false, requiresNDA: false },
    { name: "Vendor / Supplier", badgeColor: "#f59e0b", description: "Third-party service provider & facility maintenance", requiresApproval: true, requiresEscort: true, requiresNDA: true },
    { name: "Interview Candidate", badgeColor: "#10b981", description: "Prospective candidate for recruitment", requiresApproval: true, requiresEscort: true, requiresNDA: false },
    { name: "Delivery Person", badgeColor: "#64748b", description: "Courier, parcel & food delivery", requiresApproval: false, requiresEscort: false, requiresNDA: false },
    { name: "Contractor", badgeColor: "#ec4899", description: "Facility contractor & IT equipment setup", requiresApproval: true, requiresEscort: true, requiresNDA: true },
    { name: "Employee Guest", badgeColor: "#3b82f6", description: "Personal guest of workplace employee", requiresApproval: true, requiresEscort: false, requiresNDA: false },
    { name: "VIP Visitor", badgeColor: "#8b5cf6", description: "Executive dignitary, board member or investor", requiresApproval: false, requiresEscort: true, requiresNDA: false },
  ];

  const createdTypes = {};
  for (const t of visitorTypesData) {
    const vt = await prisma.visitorType.create({
      data: { ...t, organizationId: org.id },
    });
    createdTypes[t.name] = vt;
  }

  // 6. Users & Roles
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(8).toString("hex") + "A1!";
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`\n🔑 [SEED GENERATED PASSWORD]: ${seedPassword}\nUse this password to log in as seed administrators.\n`);
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  // Super Admin
  const superAdmin = await prisma.user.create({
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
  const recUser = await prisma.user.create({
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
  const secUser = await prisma.user.create({
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

  // Host Employee 1 - Alex Morgan
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

  // Host Employee 2 - Sarah Jenkins
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

  // Host Employee 3 - David Chen
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

  // 7. Create Active Sessions in Session Table
  const sampleTokenHash = crypto.createHash("sha256").update("sample_demo_session_token").digest("hex");
  await prisma.session.create({
    data: {
      userId: adminUser.id,
      tokenHash: sampleTokenHash,
      device: "Desktop Chrome (Windows 11)",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });

  // 8. Sample Visitors
  const visitor1 = await prisma.visitor.create({
    data: {
      name: "Rajesh Sharma",
      email: "rajesh.sharma@apexcorp.com",
      phone: "+91 98200 44551",
      company: "Apex Enterprise Solutions",
      visitorTypeId: createdTypes["Enterprise Client"].id,
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
      visitorTypeId: createdTypes["Interview Candidate"].id,
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
      visitorTypeId: createdTypes["Vendor / Supplier"].id,
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
      visitorTypeId: createdTypes["VIP Visitor"].id,
      organizationId: org.id,
    },
  });

  // 9. Blacklist Visitor
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
      passUrl: "http://localhost:3000/pass/ENTRIVO-INV-APEX-101",
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
      passUrl: "http://localhost:3000/pass/ENTRIVO-INV-CAND-202",
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
      passUrl: "http://localhost:3000/pass/ENTRIVO-INV-VIP-303",
    },
  });

  // 11. Active Checked-in visitor
  const checkIn1 = await prisma.checkIn.create({
    data: {
      visitorId: visitor1.id,
      invitationId: invitation1.id,
      hostEmployeeId: alexEmp.id,
      checkInTime: new Date(Date.now() - 3600000),
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

  // 12. Completed Checked-out visitor
  const checkIn2 = await prisma.checkIn.create({
    data: {
      visitorId: visitor3.id,
      hostEmployeeId: alexEmp.id,
      checkInTime: new Date(Date.now() - 14400000),
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
      checkOutTime: new Date(Date.now() - 7200000),
      durationMinutes: 120,
      checkoutMethod: "QR_SCAN",
      exitNotes: "Server rack inspection completed successfully. Badge returned.",
    },
  });

  // 13. Badge Templates
  await prisma.badgeTemplate.createMany({
    data: [
      {
        organizationId: org.id,
        name: "Standard Enterprise Badge",
        layoutType: "STANDARD",
        badgeColor: "#4f46e5",
        showPhoto: true,
        showQrCode: true,
        showHost: true,
        showCompany: true,
        isDefault: true,
      },
      {
        organizationId: org.id,
        name: "VIP Executive Gold Pass",
        layoutType: "VIP",
        badgeColor: "#d97706",
        showPhoto: true,
        showQrCode: true,
        showHost: true,
        showCompany: true,
        customHeader: "HONORED GUEST / VIP ACCESS",
        isDefault: false,
      },
      {
        organizationId: org.id,
        name: "Contractor Escorted Badge",
        layoutType: "CONTRACTOR",
        badgeColor: "#db2777",
        showPhoto: true,
        showQrCode: true,
        showHost: true,
        showCompany: true,
        customFooter: "MUST BE ESCORTED AT ALL TIMES",
        isDefault: false,
      },
    ],
  });

  // 14. Holidays
  await prisma.holiday.createMany({
    data: [
      { organizationId: org.id, name: "New Year's Day", date: new Date("2026-01-01") },
      { organizationId: org.id, name: "Republic Day", date: new Date("2026-01-26") },
      { organizationId: org.id, name: "Independence Day", date: new Date("2026-08-15") },
      { organizationId: org.id, name: "Diwali Festival", date: new Date("2026-11-08") },
      { organizationId: org.id, name: "Christmas Day", date: new Date("2026-12-25") },
    ],
  });

  // 15. ApiKey and Webhook
  const apiKeyHash = crypto.createHash("sha256").update("ent_live_sec_key_9988").digest("hex");
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      name: "HQ Production API Access",
      keyHash: apiKeyHash,
      prefix: "ent_live_",
      permissions: "read,write,visitors,checkin",
    },
  });

  await prisma.webhookSubscription.create({
    data: {
      organizationId: org.id,
      url: "https://api.acme.corp/webhooks/entrivo-visitors",
      secret: "whsec_entrivo_production_998811",
      events: "visitor.checkin,visitor.checkout,security.alert",
      isActive: true,
    },
  });

  // 16. Multi-Channel Notification Templates
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

  // 17. Security & Audit Logs
  await prisma.securityLog.create({
    data: {
      organizationId: org.id,
      logType: "ENTRY_VERIFIED",
      description: "Visitor Rajesh Sharma badge issued and turnstile entry authorized.",
      severity: SecuritySeverity.LOW,
      guardName: "Vikram Rathore",
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      action: "PLATFORM_INITIALIZATION",
      entity: "ORGANIZATION",
      entityId: org.id,
      details: "Entrivo Enterprise Workplace platform initialized with RBAC and security layers.",
      ipAddress: "127.0.0.1",
    },
  });

  console.log("✅ Entrivo Enterprise Database Seeded Successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
