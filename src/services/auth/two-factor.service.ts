import "server-only";
import { generateSecret, generateURI, verifySync } from "otplib";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

export interface TwoFactorEnrolResult {
  secret: string;
  otpAuthUrl: string;
  backupCodes: string[];
}

export class TwoFactorService {
  /**
   * Generates a new TOTP secret, otpauth URL, and 10 plaintext backup codes.
   */
  async startEnrolment(user: { id: string; email: string; name: string }): Promise<TwoFactorEnrolResult> {
    const secret = generateSecret();
    const appName = process.env.NEXT_PUBLIC_APP_NAME || "Entrivo";
    const otpAuthUrl = generateURI({
      issuer: appName,
      label: user.email,
      secret,
    });

    // Generate 10 random 8-character backup codes (formatted as XXXX-XXXX)
    const backupCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
      backupCodes.push(formatted);
      hashedCodes.push(await bcrypt.hash(formatted, 10));
    }

    // Encrypt secret with APP_ENCRYPTION_KEY
    const encryptedSecret = encrypt(secret);

    // Save encrypted secret & hashed backup codes with isTwoFactorEnabled = false until confirmed
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorBackupCodes: JSON.stringify(hashedCodes),
        isTwoFactorEnabled: false,
      },
    });

    return {
      secret,
      otpAuthUrl,
      backupCodes,
    };
  }

  /**
   * Confirms TOTP setup by verifying the first code submitted by the user.
   */
  async confirmEnrolment(userId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorSecret: true, organizationId: true },
    });

    if (!user || !user.twoFactorSecret) {
      return { success: false, error: "2FA enrolment was not initiated." };
    }

    const rawSecret = decrypt(user.twoFactorSecret);
    const cleanCode = code.replace(/\s+/g, "");

    const check = verifySync({ token: cleanCode, secret: rawSecret });
    if (!check.valid) {
      return { success: false, error: "Invalid verification code. Please check your authenticator app." };
    }

    // Activate 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorConfirmedAt: new Date(),
      },
    });

    if (user.organizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId,
          action: "TWO_FACTOR_ENABLED",
          entity: "USER",
          entityId: userId,
          details: "Two-factor authentication (TOTP) successfully activated.",
        },
      });
    }

    return { success: true };
  }

  /**
   * Verifies either a 6-digit TOTP code or a single-use backup code.
   */
  async verifyCodeOrBackup(
    user: { id: string; twoFactorSecret: string | null; twoFactorBackupCodes: string | null },
    code: string
  ): Promise<{ valid: boolean; usedBackupCode?: boolean; error?: string }> {
    if (!user.twoFactorSecret) {
      return { valid: false, error: "2FA is not configured for this account." };
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "");

    // 1. Try TOTP code (digits only, length 6)
    if (/^\d{6}$/.test(cleanCode)) {
      try {
        const rawSecret = decrypt(user.twoFactorSecret);
        const check = verifySync({ token: cleanCode, secret: rawSecret });
        if (check.valid) {
          return { valid: true, usedBackupCode: false };
        }
      } catch (err) {
        console.error("[TwoFactorService] TOTP decryption or verification error:", err);
      }
    }

    // 2. Try Backup Code (format XXXX-XXXX or 8 hex characters)
    const formattedInput = cleanCode.includes("-")
      ? cleanCode
      : `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}`;

    if (user.twoFactorBackupCodes) {
      try {
        const hashedList: string[] = JSON.parse(user.twoFactorBackupCodes);
        for (let i = 0; i < hashedList.length; i++) {
          const match = await bcrypt.compare(formattedInput, hashedList[i]);
          if (match) {
            // Consume backup code (remove from array)
            const remaining = hashedList.filter((_, idx) => idx !== i);
            await prisma.user.update({
              where: { id: user.id },
              data: { twoFactorBackupCodes: JSON.stringify(remaining) },
            });

            return { valid: true, usedBackupCode: true };
          }
        }
      } catch (err) {
        console.error("[TwoFactorService] Error parsing backup codes:", err);
      }
    }

    return { valid: false, error: "Invalid authenticator code or backup recovery code." };
  }

  /**
   * Disables 2FA after checking password and a valid TOTP/backup code.
   */
  async disableTwoFactor(
    userId: string,
    passwordVerified: boolean,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!passwordVerified) {
      return { success: false, error: "Incorrect password." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
        organizationId: true,
      },
    });

    if (!user || !user.twoFactorSecret) {
      return { success: false, error: "Two-factor authentication is not active." };
    }

    const check = await this.verifyCodeOrBackup(user, code);
    if (!check.valid) {
      return { success: false, error: check.error || "Invalid 2FA code." };
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        twoFactorConfirmedAt: null,
      },
    });

    if (user.organizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId,
          action: "TWO_FACTOR_DISABLED",
          entity: "USER",
          entityId: userId,
          details: "Two-factor authentication disabled by user.",
        },
      });
    }

    return { success: true };
  }
}

export const twoFactorService = new TwoFactorService();

