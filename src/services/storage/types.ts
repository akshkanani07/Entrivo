export interface StoragePutResult {
  key: string;
  size: number;
  publicUrl?: string;
}

export interface StorageGetResult {
  buffer: Buffer;
  mime: string;
}

export interface StorageDriver {
  readonly name: "local" | "cloudinary" | "s3";
  put(key: string, buffer: Buffer, mime: string): Promise<StoragePutResult>;
  get(key: string): Promise<StorageGetResult | null>;
  delete(key: string): Promise<boolean>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export type StorageDriverType = "local" | "cloudinary" | "s3";

