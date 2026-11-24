/**
 * Entrivo Standalone Background Worker Daemon
 * Processes BullMQ background queues and schedules background tasks.
 */

// Allow server-only imports to resolve cleanly outside Next.js
require("./mock-server-only.cjs");

import fs from "fs";
import { validateEnv } from "../src/lib/env";

validateEnv();

const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_PATH || "/tmp/worker-heartbeat";
function updateHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString());
  } catch {}
}
updateHeartbeat();
const heartbeatInterval = setInterval(updateHeartbeat, 15000);

import {
  getRedisConnection,
  runAutoCheckoutWorker,
  invitationSeriesQueue,
  bulkImportQueue,
} from "../src/lib/queue";
import { processNotificationJob } from "../src/services/jobs/notification.job";
import { processReportJob } from "../src/services/jobs/report.job";
import { processWebhookJob } from "../src/services/jobs/webhook.job";
import { processCalendarJob } from "../src/services/jobs/calendar.job";
import { processEmailJob } from "../src/services/jobs/email.job";
import { logger } from "../src/lib/logger";
import { Worker } from "bullmq";
import {
  materializeActiveInvitationSeries,
  processInvitationSeriesJob,
} from "../src/services/invitations/invitation-series.service";
import { processBulkImportJob } from "../src/services/invitations/bulk-import.service";
import { markPastInvitationMembersNoShow } from "../src/services/invitations/no-show.service";
import { runParkingSweep } from "../src/services/parking/parking.service";
import { processFeedbackJob } from "../src/services/feedback/feedback.service";
import { sweepSelfCheckinSessions } from "../src/services/self-checkin/self-checkin-sweep.service";

const workers: Worker[] = [];
let autoCheckoutInterval: NodeJS.Timeout | null = null;
let invitationSeriesInterval: NodeJS.Timeout | null = null;
let invitationNoShowInterval: NodeJS.Timeout | null = null;
let parkingSweepInterval: NodeJS.Timeout | null = null;
let selfCheckinSweepInterval: NodeJS.Timeout | null = null;

async function startWorker() {
  logger.info("Starting Entrivo Background Worker Daemon...");
  const connection = await getRedisConnection();

  if (connection) {
    logger.info("Redis detected. Starting BullMQ queue workers...");

    // 1. Notification Jobs Worker
    workers.push(
      new Worker(
        "notification-jobs",
        (job) => processNotificationJob(job.data),
        { connection, concurrency: 5 }
      )
    );

    workers.push(
      new Worker(
        "email-jobs",
        (job) => processEmailJob(job.data),
        { connection, concurrency: 5 }
      )
    );

    // 3. Report Jobs Worker
    workers.push(
      new Worker(
        "report-jobs",
        async (job) => {
          logger.info({ jobId: job.id, name: job.name }, "[Worker:Report] Executing job");
          await processReportJob(job.data);
        },
        { connection, concurrency: 2 }
      )
    );

    // 4. Webhook Delivery Worker
    workers.push(
      new Worker(
        "webhook-jobs",
        async (job) => {
          logger.info({ jobId: job.id, name: job.name }, "[Worker:Webhook] Executing job");
          await processWebhookJob(job.data);
        },
        { connection, concurrency: 5 }
      )
    );

    // 5. Calendar Synchronization Worker
    workers.push(
      new Worker(
        "calendar-sync",
        async (job) => {
          logger.info({ jobId: job.id, name: job.name }, "[Worker:Calendar] Executing job");
          await processCalendarJob(job.data);
        },
        { connection, concurrency: 3 }
      )
    );

    workers.push(
      new Worker(
        "invitation-series",
        (job) => processInvitationSeriesJob(job.data),
        { connection, concurrency: 2 }
      )
    );
    workers.push(
      new Worker(
        "bulk-import",
        (job) => processBulkImportJob(job.data),
        { connection, concurrency: 2 }
      )
    );
    workers.push(
      new Worker(
        "feedback-jobs",
        (job) => processFeedbackJob(job.data),
        { connection, concurrency: 5 }
      )
    );

    // Attach structured lifecycle telemetry to all workers
    for (const w of workers) {
      w.on("completed", (job) => {
        logger.info({ queue: w.name, jobId: job.id, duration: job.finishedOn ? job.finishedOn - job.processedOn! : undefined }, "[Worker] Job completed successfully");
      });

      w.on("failed", (job, err) => {
        logger.error(
          {
            queue: w.name,
            jobId: job?.id,
            attemptsMade: job?.attemptsMade,
            error: err.message,
          },
          "[Worker] Job failed"
        );
      });

      w.on("error", (err) => {
        logger.error({ queue: w.name, error: err.message }, "[Worker] Worker encountered error");
      });
    }
  } else {
    logger.warn("Running in standalone mode without active Redis. In-process queues active.");
  }

  // Periodic auto-checkout sweep (every 5 min)
  logger.info("Scheduling periodic auto-checkout monitor (every 5 min)...");
  autoCheckoutInterval = setInterval(async () => {
    try {
      const res = await runAutoCheckoutWorker();
      if (res.overstayedCount > 0) {
        logger.info({ count: res.overstayedCount }, "[Worker] Auto-checkout marked overstayed visitors");
      }
    } catch (err: any) {
      logger.error({ error: err.message }, "[Worker] Error in auto-checkout task");
    }
  }, 5 * 60 * 1000);

  invitationSeriesInterval = setInterval(async () => {
    try {
      const result = await materializeActiveInvitationSeries();
      if (result.created || result.skippedDates) {
        logger.info(result, "[Worker] Invitation series materialized");
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "[Worker] Invitation series materialization failed"
      );
    }
  }, 30 * 60 * 1000);

  invitationNoShowInterval = setInterval(async () => {
    try {
      const count = await markPastInvitationMembersNoShow();
      if (count > 0) logger.info({ count }, "[Worker] Invitation members marked no-show");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "[Worker] No-show sweep failed"
      );
    }
  }, 30 * 60 * 1000);

  parkingSweepInterval = setInterval(async () => {
    try {
      const result = await runParkingSweep();
      if (result.noShowCount || result.overstayCount) {
        logger.info(result, "[Worker] Parking assignments swept");
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "[Worker] Parking sweep failed"
      );
    }
  }, 5 * 60 * 1000);

  selfCheckinSweepInterval = setInterval(async () => {
    try {
      const result = await sweepSelfCheckinSessions();
      if (result.expired || result.escalated) {
        logger.info(result, "[Worker] Self check-in sessions swept");
      }
    } catch (error) {
      logger.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "[Worker] Self check-in session sweep failed"
      );
    }
  }, 60 * 1000);

  logger.info("Entrivo Background Worker is listening for jobs.");
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received. Closing worker threads...");
  if (autoCheckoutInterval) {
    clearInterval(autoCheckoutInterval);
  }
  if (invitationSeriesInterval) {
    clearInterval(invitationSeriesInterval);
  }
  if (invitationNoShowInterval) {
    clearInterval(invitationNoShowInterval);
  }
  if (parkingSweepInterval) {
    clearInterval(parkingSweepInterval);
  }
  if (selfCheckinSweepInterval) {
    clearInterval(selfCheckinSweepInterval);
  }
  clearInterval(heartbeatInterval);
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      fs.unlinkSync(HEARTBEAT_FILE);
    }
  } catch {}

  await Promise.allSettled(workers.map((w) => w.close()));
  logger.info("All BullMQ workers stopped cleanly.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startWorker().catch((err) => {
  logger.error({ error: err.message }, "Worker startup fatal error");
  process.exit(1);
});
