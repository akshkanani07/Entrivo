import { z } from "zod";

export const WeekdayScheduleSchema = z.object({
  isOpen: z.boolean().default(true),
  openTime: z.string().default("08:30"), // 24-hour format "HH:mm"
  closeTime: z.string().default("19:30"),
});

export const WorkingHoursSchema = z.object({
  monday: WeekdayScheduleSchema.default({ isOpen: true, openTime: "08:30", closeTime: "19:30" }),
  tuesday: WeekdayScheduleSchema.default({ isOpen: true, openTime: "08:30", closeTime: "19:30" }),
  wednesday: WeekdayScheduleSchema.default({ isOpen: true, openTime: "08:30", closeTime: "19:30" }),
  thursday: WeekdayScheduleSchema.default({ isOpen: true, openTime: "08:30", closeTime: "19:30" }),
  friday: WeekdayScheduleSchema.default({ isOpen: true, openTime: "08:30", closeTime: "19:30" }),
  saturday: WeekdayScheduleSchema.default({ isOpen: false, openTime: "09:00", closeTime: "13:00" }),
  sunday: WeekdayScheduleSchema.default({ isOpen: false, openTime: "09:00", closeTime: "13:00" }),
});

export const EnforcementModeSchema = z.enum(["ALLOW", "WARN", "BLOCK"]);
export type EnforcementMode = z.infer<typeof EnforcementModeSchema>;

export const OrgPolicySchema = z.object({
  // 1. Visitor Policies & Limits
  allowWalkIn: z.boolean().default(true),
  advanceBookingDays: z.number().min(1).max(90).default(30),
  maxVisitDurationHours: z.number().min(1).max(24).default(8),
  maxVisitorsPerHostPerDay: z.number().min(1).max(100).default(20),
  blockedVisitorTypes: z.array(z.string()).default([]),

  // 2. Verification & NDA Policies
  requirePhoto: z.boolean().default(true),
  requireIdProof: z.boolean().default(true),
  requireNda: z.boolean().default(true),
  ndaReuseEnabled: z.boolean().default(true),
  ndaValidityDays: z.number().min(1).max(730).default(365),

  // 3. Dynamic Required Fields (P6-02)
  requireCompany: z.boolean().default(true),
  requireEmail: z.boolean().default(true),
  requirePhone: z.boolean().default(true),
  requirePurpose: z.boolean().default(true),
  requireIdNumber: z.boolean().default(false),
  requireHost: z.boolean().default(true),

  // 4. Approval Rules
  autoApprovalEnabled: z.boolean().default(false),
  approvalTimeoutMinutes: z.number().min(5).max(1440).default(60),
  escalateToAdminOnTimeout: z.boolean().default(true),

  // 5. Schedule & Holiday Enforcement
  workingHoursEnforcement: EnforcementModeSchema.default("WARN"),
  holidayEnforcement: EnforcementModeSchema.default("WARN"),
  workingHours: WorkingHoursSchema.default({
    monday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
    tuesday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
    wednesday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
    thursday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
    friday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
    saturday: { isOpen: false, openTime: "09:00", closeTime: "13:00" },
    sunday: { isOpen: false, openTime: "09:00", closeTime: "13:00" },
  }),

  // 6. Security & Session Rules
  sessionIdleTimeoutMinutes: z.number().min(0).max(480).default(30),
  sessionAbsoluteLifetimeHours: z.number().min(1).max(168).default(24),
  require2faForRoles: z.array(z.string()).default([]),
  requireVerifiedEmail: z.boolean().default(false),
  maxLoginAttempts: z.number().min(3).max(10).default(5),
  lockoutWindowMinutes: z.number().min(5).max(120).default(15),

  // 7. Password Policy
  passwordMinLength: z.number().min(8).max(64).default(10),
  passwordRequireSpecial: z.boolean().default(true),
  passwordHistoryCount: z.number().min(0).max(24).default(5),

  // 8. Notifications Channels & Quiet Hours
  emailNotificationsEnabled: z.boolean().default(true),
  webPushNotificationsEnabled: z.boolean().default(true),
  slackNotificationsEnabled: z.boolean().default(true),
  teamsNotificationsEnabled: z.boolean().default(true),
  quietHoursEnabled: z.boolean().default(false),
  quietHoursStart: z.string().default("21:00"),
  quietHoursEnd: z.string().default("07:00"),

  // 9. Data Retention & DPDP Tooling (P6-03)
  retentionPhotosDays: z.number().min(1).max(3650).default(90),
  retentionSignaturesDays: z.number().min(1).max(3650).default(180),
  retentionIdProofsDays: z.number().min(1).max(3650).default(90),
  retentionVisitorRecordsDays: z.number().min(30).max(3650).default(365),
  privacyPolicyNoticeVersion: z.string().default("v1.0"),
});

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;
