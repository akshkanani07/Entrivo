import "server-only";
import { StorageDriver, StoragePutResult, StorageGetResult } from "./types";
import { LocalStorageDriver } from "./local.driver";

export class CloudinaryStorageDriver implements StorageDriver {
  readonly name = "cloudinary" as const;
  private fallback: LocalStorageDriver;
  private isConfigured: boolean;

  constructor() {
    this.fallback = new LocalStorageDriver();
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    this.isConfigured = Boolean(
      cloudName &&
      apiKey &&
      apiSecret &&
      !apiKey.startsWith("mock_") &&
      !cloudName.startsWith("mock_")
    );
  }

  async put(key: string, buffer: Buffer, mime: string): Promise<StoragePutResult> {
    if (!this.isConfigured) {
      return this.fallback.put(key, buffer, mime);
    }
    // Production Cloudinary authenticated upload
    try {
      const base64Data = `data:${mime};base64,${buffer.toString("base64")}`;
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const timestamp = Math.floor(Date.now() / 1000);

      // Signature for authenticated delivery
      const crypto = await import("crypto");
      const signatureStr = `public_id=${key}&timestamp=${timestamp}&type=authenticated${apiSecret}`;
      const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

      const formData = new FormData();
      formData.append("file", base64Data);
      formData.append("api_key", apiKey!);
      formData.append("timestamp", timestamp.toString());
      formData.append("public_id", key);
      formData.append("type", "authenticated");
      formData.append("signature", signature);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Cloudinary upload failed: ${res.statusText}`);
      }

      return { key, size: buffer.length };
    } catch (err) {
      console.warn("[CloudinaryDriver] Upload failed, falling back to local storage:", err);
      return this.fallback.put(key, buffer, mime);
    }
  }

  async get(key: string): Promise<StorageGetResult | null> {
    return this.fallback.get(key);
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isConfigured) {
      return this.fallback.delete(key);
    }
    // Delete from local and return true
    await this.fallback.delete(key);
    return true;
  }

  async exists(key: string): Promise<boolean> {
    return this.fallback.exists(key);
  }

  async signedUrl(key: string, expiresInSeconds = 60): Promise<string> {
    return this.fallback.signedUrl(key, expiresInSeconds);
  }
}

