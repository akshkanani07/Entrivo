import "server-only";
import { StorageDriver, StorageDriverType } from "./types";
import { LocalStorageDriver } from "./local.driver";
import { CloudinaryStorageDriver } from "./cloudinary.driver";
import { S3StorageDriver } from "./s3.driver";

export * from "./types";

function createStorageDriver(): StorageDriver {
  const driverType = (process.env.STORAGE_DRIVER || "local").toLowerCase() as StorageDriverType;

  switch (driverType) {
    case "cloudinary":
      return new CloudinaryStorageDriver();
    case "s3":
      return new S3StorageDriver();
    case "local":
    default:
      return new LocalStorageDriver();
  }
}

export const storage = createStorageDriver();

