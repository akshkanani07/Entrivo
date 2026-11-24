import { z } from "zod";
import { requiredString } from "@/lib/zod-helpers";

export const walkinDeskOverrideSchema = z.object({
  invitationId: requiredString("Invitation ID is required"),
  reason: requiredString("A reason of at least 10 characters is required.", 10).pipe(
    z.string().max(500, "Override reason must be 500 characters or fewer.")
  ),
});
