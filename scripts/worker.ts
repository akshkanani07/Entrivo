/**
 * Entrivo Standalone Background Worker
 * Processes background queues (BullMQ with Redis, or fallback polling).
 */

import { getRedisConnection, runAutoCheckoutWorker } from "../src/lib/queue";
import { Worker } from "bullmq";

async function startWorker() {
  console.log("🚀 Starting Entrivo Background Worker Daemon...");
  const connection = await getRedisConnection();

  if (connection) {
    console.log("⚡ Redis detected. Starting BullMQ queue workers...");

    new Worker(
      "notification-jobs",
      async (job) => {
        console.log(`[Worker] Processing notification job ${job.id}:`, job.name);
      },
      { connection }
    );

    new Worker(
      "email-jobs",
      async (job) => {
        console.log(`[Worker] Processing email job ${job.id}:`, job.name);
      },
      { connection }
    );
  } else {
    console.log("ℹ️  Running in standalone mode without active Redis. In-process queues active.");
  }

  // Periodic tasks (e.g. auto checkout sweep every 5 minutes)
  console.log("🕒 Scheduling periodic auto-checkout monitor (every 5 min)...");
  setInterval(async () => {
    try {
      const res = await runAutoCheckoutWorker();
      if (res.overstayedCount > 0) {
        console.log(`[Worker] Auto-checkout marked ${res.overstayedCount} overstayed visitors.`);
      }
    } catch (err) {
      console.error("[Worker] Error in auto-checkout task:", err);
    }
  }, 5 * 60 * 1000);

  console.log("✅ Entrivo Background Worker is listening for jobs.");
}

startWorker().catch((err) => {
  console.error("Worker startup error:", err);
  process.exit(1);
});

