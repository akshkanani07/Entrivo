import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { logger } from "@/lib/logger";

export interface CalendarJobData {
  invitationId: string;
  action: "CREATE" | "UPDATE" | "CANCEL";
}

export async function processCalendarJob(data: CalendarJobData): Promise<void> {
  const { invitationId, action } = data;
  logger.info({ invitationId, action }, "[Job:Calendar] Processing calendar sync");

  const result = await syncInvitationCalendar(invitationId, action);
  if (!result.success) {
    logger.error({ invitationId, action, error: result.error }, "[Job:Calendar] Sync failed");
    throw new Error(result.error || "Calendar sync failed");
  }

  logger.info({ invitationId, action, eventId: result.eventId, mock: result.mock }, "[Job:Calendar] Calendar sync completed");
}

import { calendarQueue } from "@/lib/queue";
calendarQueue.process(processCalendarJob);
