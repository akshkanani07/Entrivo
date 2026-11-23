import { Queue } from "bullmq";
import Redis from "ioredis";
import { prisma } from "./db";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: Redis | null = null;
let redisChecked = false;
let isRedisAvailable = false;

export async function getRedisConnection(): Promise<Redis | null> {
  if (redisChecked) {
    return isRedisAvailable ? redisClient : null;
  }

  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null, // don't hang if redis is not running
      lazyConnect: true,
      connectTimeout: 2000,
    });

    await client.connect();
    redisClient = client;
    isRedisAvailable = true;
    redisChecked = true;
    logger.info("Connected to Redis for BullMQ queues.");
    return redisClient;
  } catch {
    isRedisAvailable = false;
    redisChecked = true;
    return null;
  }
}

export interface QueueJob<T = any> {
  name: string;
  data: T;
  retryCount?: number;
}

const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2m

export class ResilientQueue<T = any> {
  public readonly queueName: string;
  private bullQueue: Queue | null = null;
  private processor?: (data: T) => Promise<void>;

  constructor(name: string, defaultProcessor?: (data: T) => Promise<void>) {
    this.queueName = name;
    if (defaultProcessor) {
      this.processor = defaultProcessor;
    }
  }

  process(fn: (data: T) => Promise<void>) {
    this.processor = fn;
  }

  getProcessor() {
    return this.processor;
  }

  async add(jobName: string, data: T, opts?: { attempts?: number; delay?: number }) {
    const connection = await getRedisConnection();
    if (connection) {
      try {
        if (!this.bullQueue) {
          this.bullQueue = new Queue(this.queueName, { connection });
        }
        return await this.bullQueue.add(jobName, data, {
          attempts: opts?.attempts ?? 5,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: false, // Keep in failed state for dead-letter inspection
          delay: opts?.delay,
        });
      } catch (err) {
        logger.warn({ queue: this.queueName, err }, "[BullMQ] Fallback to in-process runner");
      }
    }

    // In-process resilient fallback runner with retries
    this.runInProcess(jobName, data, 0);
    return { id: `inproc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  }

  private runInProcess(jobName: string, data: T, attempt: number) {
    setTimeout(async () => {
      if (!this.processor) return;
      try {
        await this.processor(data);
      } catch (err) {
        logger.error({ queue: this.queueName, attempt: attempt + 1, err }, "[InProcess] Error executing job");
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          logger.info({ queue: this.queueName, attempt: attempt + 1, delayMs: delay }, "[InProcess] Scheduling retry");
          setTimeout(() => this.runInProcess(jobName, data, attempt + 1), delay);
        }
      }
    }, attempt === 0 ? 10 : 0);
  }
}

export const emailQueue = new ResilientQueue("email-jobs");
export const notificationQueue = new ResilientQueue("notification-jobs");
export const reportQueue = new ResilientQueue("report-jobs");
export const webhookQueue = new ResilientQueue("webhook-jobs");
export const calendarQueue = new ResilientQueue("calendar-sync");

// Auto Checkout Background Worker
export async function runAutoCheckoutWorker(): Promise<{ overstayedCount: number }> {
  try {
    const now = new Date();
    const overdueCheckins = await prisma.checkIn.findMany({
      where: {
        status: "CHECKED_IN",
        expectedCheckout: { lt: now },
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true } },
      },
    });

    for (const c of overdueCheckins) {
      await prisma.checkIn.update({
        where: { id: c.id },
        data: { status: "OVERSTAYED" },
      });

      await prisma.securityLog.create({
        data: {
          organizationId: c.visitor?.organizationId || "",
          logType: "VISITOR_OVERSTAYED",
          description: `Visitor ${c.visitor?.name || "Guest"} (Badge: ${c.badgeNumber || ""}) exceeded expected checkout time. Status updated to OVERSTAYED.`,
          severity: "HIGH",
          guardName: "System Worker",
        },
      });

      // Notify host and security staff of visitor overstay
      if (c.visitor?.organizationId) {
        try {
          const { notify } = await import("@/services/notifications/dispatcher");
          const { NotificationEvent } = await import("@/services/notifications/events");
          await notify(NotificationEvent.VISITOR_OVERSTAYED, {
            organizationId: c.visitor.organizationId,
            visitorName: c.visitor.name || "Guest",
            visitorCompany: c.visitor.company || undefined,
            hostName: c.hostEmployee?.user?.name || "Host",
            hostEmail: c.hostEmployee?.user?.email,
            hostUserId: c.hostEmployee?.userId,
            badgeNumber: c.badgeNumber || undefined,
            overstayDuration: "Exceeded scheduled visit duration",
            entityId: `overstay-${c.id}`,
          });
        } catch (notifyErr) {
          logger.error({ err: notifyErr }, "Overstay notification error");
        }
      }
    }

    return { overstayedCount: overdueCheckins.length };
  } catch (error) {
    logger.error({ err: error }, "Auto checkout worker error");
    return { overstayedCount: 0 };
  }
}
