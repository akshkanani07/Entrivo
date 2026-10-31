import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { prisma } from "./db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisConnection: Redis | null = null;
let isRedisAvailable = false;

try {
  redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: () => null, // don't spam if local redis is off
    lazyConnect: true,
  });

  redisConnection.connect().then(() => {
    isRedisAvailable = true;
    console.log("⚡ Connected to Redis for BullMQ queues.");
  }).catch(() => {
    isRedisAvailable = false;
  });
} catch {
  isRedisAvailable = false;
}

// Resilient queue wrapper
class BullMQResilientQueue<T = any> {
  private queueName: string;
  private bullQueue?: Queue;
  private processor?: (data: T) => Promise<void>;

  constructor(name: string) {
    this.queueName = name;
    if (isRedisAvailable && redisConnection) {
      try {
        this.bullQueue = new Queue(name, { connection: redisConnection });
      } catch {}
    }
  }

  process(fn: (data: T) => Promise<void>) {
    this.processor = fn;
    if (isRedisAvailable && redisConnection) {
      try {
        new Worker(this.queueName, async (job) => fn(job.data), { connection: redisConnection });
      } catch {}
    }
  }

  async add(jobName: string, data: T) {
    if (isRedisAvailable && this.bullQueue) {
      return this.bullQueue.add(jobName, data);
    }
    // Asynchronous non-blocking background fallback
    setTimeout(async () => {
      if (this.processor) {
        try {
          await this.processor(data);
        } catch (err) {
          console.error(`[Queue ${this.queueName}] Error:`, err);
        }
      }
    }, 20);
    return { id: `job-${Date.now()}` };
  }
}

export const emailQueue = new BullMQResilientQueue("email-jobs");
export const whatsappQueue = new BullMQResilientQueue("whatsapp-jobs");
export const reportQueue = new BullMQResilientQueue("report-jobs");

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
          organizationId: c.visitor.organizationId,
          logType: "VISITOR_OVERSTAYED",
          description: `Visitor ${c.visitor.name} (Badge: ${c.badgeNumber}) exceeded expected checkout time. Status updated to OVERSTAYED.`,
          severity: "HIGH",
          reportedBy: "System Background Worker",
        },
      });
    }

    return { overstayedCount: overdueCheckins.length };
  } catch (error) {
    console.error("Auto checkout worker error:", error);
    return { overstayedCount: 0 };
  }
}
