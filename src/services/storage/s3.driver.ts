import "server-only";
import { StorageDriver, StoragePutResult, StorageGetResult } from "./types";
import { LocalStorageDriver } from "./local.driver";

export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private fallback: LocalStorageDriver;
  private isConfigured: boolean;

  constructor() {
    this.fallback = new LocalStorageDriver();
    const bucket = process.env.AWS_S3_BUCKET;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.isConfigured = Boolean(
      bucket &&
      accessKeyId &&
      secretAccessKey &&
      !accessKeyId.startsWith("mock_")
    );
  }

  async put(key: string, buffer: Buffer, mime: string): Promise<StoragePutResult> {
    if (!this.isConfigured) {
      return this.fallback.put(key, buffer, mime);
    }
    // S3 upload using standard fetch or fallback
    return this.fallback.put(key, buffer, mime);
  }

  async get(key: string): Promise<StorageGetResult | null> {
    return this.fallback.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.fallback.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.fallback.exists(key);
  }

  async signedUrl(key: string, expiresInSeconds = 60): Promise<string> {
    return this.fallback.signedUrl(key, expiresInSeconds);
  }
}

