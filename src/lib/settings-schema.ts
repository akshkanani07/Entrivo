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
  // Visitor Policy
  maxVisitDurationHours: z.number().min(1).max(24).default(8),
  allowWalkIn: z.boolean().default(true),
  requirePhoto: z.boolean().default(true),
  requireIdProof: z.boolean().default(true),
  requireNda: z.boolean().default(true),
  advanceBookingDays: z.number().min(1).max(90).default(30),
  maxVisitorsPerHostPerDay: z.number().min(1).max(100).default(20),
  blockedVisitorTypes: z.array(z.string()).default([]),

  // Check-In & Schedule Rules
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

  // Security Rules
  sessionIdleTimeoutMinutes: z.number().min(0).max(480).default(30),
  sessionAbsoluteLifetimeHours: z.number().min(1).max(168).default(24),
  require2faForRoles: z.array(z.string()).default([]),
  requireVerifiedEmail: z.boolean().default(false),

  // Password Policy
  passwordMinLength: z.number().min(8).max(64).default(10),
  passwordRequireSpecial: z.boolean().default(true),
  passwordHistoryCount: z.number().min(0).max(24).default(5),
});

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

