import { describe, it, expect, vi } from "vitest";
import { ResilientQueue, getRedisConnection } from "@/lib/queue";
import { processWebhookJob } from "@/services/jobs/webhook.job";
import * as webhookService from "@/services/webhooks/webhook.service";
import { Worker } from "bullmq";

describe("1.5 Background Worker & ResilientQueue Job Processing", () => {
  it("enqueues a job and executes processor cleanly in in-process fallback mode", async () => {
    let jobExecuted = false;
    let receivedPayload: any = null;

    const testQueue = new ResilientQueue<{ message: string }>("test-inproc-jobs");
    testQueue.process(async (data) => {
      jobExecuted = true;
      receivedPayload = data;
    });

    // Explicitly test in-process execution fallback
    (testQueue as any).runInProcess("test-task", { message: "Hello Entrivo Worker" }, 0);

    // Wait for in-process runner setTimeout to tick
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(jobExecuted).toBe(true);
    expect(receivedPayload).toEqual({ message: "Hello Entrivo Worker" });
  });

  it("enqueues to BullMQ and worker processes the job when Redis is active", async () => {
    const redis = await getRedisConnection();
    if (!redis) {
      // Skip BullMQ worker test if Redis is not available
      return;
    }

    let workerProcessed = false;
    const testQueueName = `test-bullmq-${Date.now()}`;
    const queue = new ResilientQueue<{ text: string }>(testQueueName);

    const worker = new Worker(
      testQueueName,
      async (job) => {
        if (job.data.text === "bullmq-works") {
          workerProcessed = true;
        }
      },
      { connection: redis }
    );

    await queue.add("test-bullmq-job", { text: "bullmq-works" });

    // Wait for worker to consume job
    const start = Date.now();
    while (!workerProcessed && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    await worker.close();
    expect(workerProcessed).toBe(true);
  });

  it("processes webhook delivery jobs through processWebhookJob", async () => {
    const deliverSpy = vi.spyOn(webhookService, "deliverWebhook").mockResolvedValueOnce({
      success: true,
      statusCode: 200,
    });

    await processWebhookJob({ deliveryId: "del_test_123" });

    expect(deliverSpy).toHaveBeenCalledWith("del_test_123");
    deliverSpy.mockRestore();
  });

  it("throws error in job processor on delivery failure to trigger BullMQ retry", async () => {
    const deliverSpy = vi.spyOn(webhookService, "deliverWebhook").mockResolvedValueOnce({
      success: false,
      statusCode: 500,
      error: "Destination server error 500",
    });

    await expect(processWebhookJob({ deliveryId: "del_fail_123" })).rejects.toThrow("Destination server error 500");
    deliverSpy.mockRestore();
  });
});
