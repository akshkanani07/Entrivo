CREATE TYPE "LoginProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'MAGIC_LINK');

ALTER TABLE "User"
ADD COLUMN "googleId" TEXT,
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "lastLoginProvider" "LoginProvider" NOT NULL DEFAULT 'PASSWORD';

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

ALTER TABLE "SecurityLog"
ALTER COLUMN "organizationId" DROP NOT NULL;
