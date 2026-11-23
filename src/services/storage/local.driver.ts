import "server-only";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { StorageDriver, StoragePutResult, StorageGetResult } from "./types";
import { getAppUrl } from "@/lib/app-url";

export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), ".uploads");
    if (!fsSync.existsSync(this.uploadDir)) {
      fsSync.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private resolveSafePath(key: string): string {
    const safeKey = key.replace(/^[/\\]+/, "");
    const fullPath = path.resolve(this.uploadDir, safeKey);
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error("Security violation: path traversal detected in storage key");
    }
    return fullPath;
  }

  async put(key: string, buffer: Buffer, mime: string): Promise<StoragePutResult> {
    const fullPath = this.resolveSafePath(key);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    // Write companion meta file for MIME type
    await fs.writeFile(`${fullPath}.meta`, JSON.stringify({ mime, size: buffer.length }));
    return { key, size: buffer.length };
  }

  async get(key: string): Promise<StorageGetResult | null> {
    const fullPath = this.resolveSafePath(key);
    try {
      const buffer = await fs.readFile(fullPath);
      let mime = "application/octet-stream";
      try {
        const metaRaw = await fs.readFile(`${fullPath}.meta`, "utf8");
        const meta = JSON.parse(metaRaw);
        if (meta.mime) mime = meta.mime;
      } catch {
        // Fallback mime detection
        if (key.endsWith(".jpg") || key.endsWith(".jpeg")) mime = "image/jpeg";
        else if (key.endsWith(".png")) mime = "image/png";
        else if (key.endsWith(".webp")) mime = "image/webp";
        else if (key.endsWith(".pdf")) mime = "application/pdf";
      }
      return { buffer, mime };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.unlink(fullPath);
      try {
        await fs.unlink(`${fullPath}.meta`);
      } catch {
        // meta file optional
      }
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, expiresInSeconds = 60): Promise<string> {
    const secret = process.env.JWT_SECRET || "entrivo-local-storage-secret";
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(`${key}:${expiresAt}`)
      .digest("hex")
      .slice(0, 32);

    const appUrl = getAppUrl();
    const encodedKey = encodeURIComponent(key);
    return `${appUrl}/api/files/download?key=${encodedKey}&exp=${expiresAt}&sig=${hmac}`;
  }
}

