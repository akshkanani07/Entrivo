/**
 * Entrivo Standalone Background Worker Daemon
 * Processes BullMQ background queues and schedules background tasks.
 */

// Allow server-only imports to resolve cleanly outside Next.js
require("./mock-server-only.cjs");

import { getRedisConnection, runAutoCheckoutWorker } from "../src/lib/queue";
import { processEmailJob } from "../src/services/jobs/email.job";
import { processNotificationJob } from "../src/services/jobs/notification.job";
import { processReportJob } from "../src/services/jobs/report.job";
import { processWebhookJob } from "../src/services/jobs/webhook.job";
import { processCalendarJob } from "../src/services/jobs/calendar.job";
import { logger } from "../src/lib/logger";
import { Worker } from "bullmq";

const workers: Worker[] = [];
let autoCheckoutInterval: NodeJS.Timeout | null = null;

async function startWorker() {
  logger.info("Starting Entrivo Background Worker Daemon...");
  const connection = await getRedisConnection();

  if (connection) {
    logger.info("Redis detected. Starting BullMQ queue workers...");

    // 1. Email Jobs Worker
    workers.push(
      new Worker(
        "email-jobs",
        async (job) => {
          logger.info({ jobId: job.id, name: job.name }, "[Worker:Email] Executing job");
          await processEmailJob(job.data);
        },
        { connection, concurrency: 5 }
      )
    );

    // 2. Notification Jobs Worker
    workers.push(
      new Worker(
        "notification-jobs",
        async (job) => {
          logger.info({ jobId: job.id, name: job.name }, "[Worker:Notification] Executing job");
          await processNotificationJob(job.data);
        },
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

  logger.info("Entrivo Background Worker is listening for jobs.");
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received. Closing worker threads...");
  if (autoCheckoutInterval) {
    clearInterval(autoCheckoutInterval);
  }

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
