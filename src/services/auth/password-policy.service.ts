import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { validatePasswordStrength } from "@/lib/auth";

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  historyCount: number;
  maxAgeDays?: number;
}

const DEFAULT_POLICY: PasswordPolicyConfig = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  historyCount: 5,
};

export class PasswordPolicyService {
  /**
   * Retrieves effective password policy for an organization.
   */
  async getPolicy(organizationId?: string | null): Promise<PasswordPolicyConfig> {
    if (!organizationId) return DEFAULT_POLICY;

    try {
      const setting = await prisma.setting.findFirst({
        where: { organizationId, key: "PASSWORD_POLICY" },
      });

      if (setting?.value) {
        const parsed = JSON.parse(setting.value);
        return {
          ...DEFAULT_POLICY,
          ...parsed,
        };
      }
    } catch {
      // Fallback to default
    }

    return DEFAULT_POLICY;
  }

  /**
   * Validates password against complexity and historical reuse rules.
   */
  async validatePassword(
    password: string,
    user: { id?: string; email: string; organizationId?: string | null }
  ): Promise<{ valid: boolean; error?: string }> {
    const policy = await this.getPolicy(user.organizationId);

    // 1. Min length
    if (!password || password.length < policy.minLength) {
      return {
        valid: false,
        error: `Password must be at least ${policy.minLength} characters long.`,
      };
    }

    // 2. Base strength validation
    const baseCheck = validatePasswordStrength(password, user.email);
    if (!baseCheck.valid) {
      return baseCheck;
    }

    // 3. Special characters
    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one special character (!@#$%^&*...).",
      };
    }

    // 4. Password History Check (prevent reuse of last N passwords)
    if (user.id && policy.historyCount > 0) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          passwordHash: true,
          passwordHistories: {
            orderBy: { createdAt: "desc" },
            take: policy.historyCount,
            select: { passwordHash: true },
          },
        },
      });

      if (dbUser) {
        // Compare with current hash
        const currentMatch = await bcrypt.compare(password, dbUser.passwordHash);
        if (currentMatch) {
          return {
            valid: false,
            error: "New password cannot be the same as your current password.",
          };
        }

        // Compare with past hashes
        for (const history of dbUser.passwordHistories) {
          const match = await bcrypt.compare(password, history.passwordHash);
          if (match) {
            return {
              valid: false,
              error: `You cannot reuse any of your last ${policy.historyCount} passwords.`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Records a new password hash in the history table and prunes old entries.
   */
  async recordPasswordHistory(userId: string, newPasswordHash: string) {
    try {
      await prisma.passwordHistory.create({
        data: {
          userId,
          passwordHash: newPasswordHash,
        },
      });

      // Keep only last 10 entries per user
      const histories = await prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (histories.length > 10) {
        const toDelete = histories.slice(10).map((h) => h.id);
        await prisma.passwordHistory.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    } catch (err) {
      console.error("[PasswordPolicy] Error recording password history:", err);
    }
  }
}

export const passwordPolicyService = new PasswordPolicyService();

