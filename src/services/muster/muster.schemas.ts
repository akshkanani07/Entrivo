import { z } from "zod";
import { requiredString } from "@/lib/zod-helpers";

export const startEmergencyEventSchema = z.object({
  organizationId: requiredString("Organization is required"),
  actorId: requiredString("Event starter is required"),
  branchId: z.string().trim().min(1).optional(),
  officeId: z.string().trim().min(1).optional(),
  floorId: z.string().trim().min(1).optional(),
  zoneId: z.string().trim().min(1).optional(),
  type: z.enum(["REAL", "DRILL"]),
  kind: z.enum(["FIRE", "EARTHQUAKE", "SECURITY", "MEDICAL", "OTHER"]),
  message: requiredString("Emergency message is required", 3).pipe(z.string().max(1000)),
}).refine((value) => !value.zoneId || Boolean(value.floorId), {
  message: "A zone scope requires a floor",
  path: ["floorId"],
});

export const accountMusterEntrySchema = z.object({
  organizationId: requiredString("Organization is required"),
  eventId: requiredString("Emergency event is required"),
  entryId: requiredString("Muster entry is required"),
  actorId: requiredString("Accounted-by user is required"),
  clientEventId: requiredString("Client event ID is required").pipe(z.string().max(128)),
  status: z.enum(["SAFE", "MISSING", "HOSPITAL"]),
  musterPointId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(1000).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  offlineIdentity: z.object({
    actorUserId: requiredString("Accounted-by user is required"),
    organizationId: requiredString("Organization is required"),
  }).optional(),
});

export const emergencyEventScopeSchema = z.object({
  organizationId: requiredString("Organization is required"),
  eventId: requiredString("Emergency event is required"),
  actorId: requiredString("User is required"),
});
