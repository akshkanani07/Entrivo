type JobHandler<T> = (data: T) => Promise<void>;

interface QueuedJob<T> {
  id: string;
  name: string;
  data: T;
  timestamp: number;
}

class EntrivoQueue<T = any> {
  private queueName: string;
  private handler?: JobHandler<T>;

  constructor(name: string) {
    this.queueName = name;
  }

  process(handler: JobHandler<T>) {
    this.handler = handler;
  }

  async add(jobName: string, data: T): Promise<QueuedJob<T>> {
    const job: QueuedJob<T> = {
      id: `${this.queueName}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: jobName,
      data,
      timestamp: Date.now(),
    };

    // Execute asynchronously non-blocking in background
    setTimeout(async () => {
      if (this.handler) {
        try {
          await this.handler(data);
        } catch (error) {
          console.error(`[Queue ${this.queueName}] Error processing job ${job.id}:`, error);
        }
      }
    }, 50);

    return job;
  }
}

export const emailQueue = new EntrivoQueue("email-notifications");
export const whatsappQueue = new EntrivoQueue("whatsapp-notifications");
export const reportQueue = new EntrivoQueue("report-generation");
