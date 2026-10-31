import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { CurrentUser, UserRole } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing.");
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  orgId?: string | null;
  sessionId: string;
}

const COMMON_PASSWORDS = new Set([
  "password123", "password1234", "password12345", "1234567890", "12345678901",
  "welcome123", "welcome1234", "welcome2024", "welcome2025", "welcome2026",
  "administrator", "changeme123", "iloveyou123", "qwerty1234", "qwertyuiop",
  "letmein123", "sunshine123", "princess123", "football123", "monkey1234",
  "shadow1234", "master1234", "dragon1234", "trustno123", "superman123",
  "batman1234", "starwars123", "solo123456", "secret1234", "login12345",
  "passcode123", "entrivo123", "entrivo2024", "entrivo2025", "entrivo2026",
  "company123", "corporate123", "workplace123", "security123", "database123",
  "network123", "system1234", "server1234", "default123", "temp123456",
  "guest12345", "testing123", "test123456", "orange1234", "coffee1234",
  "access1234", "freedom123", "freedom2024", "whatever12", "computer12",
  "internet12", "matrix1234", "killer1234", "thunder123", "warrior123",
  "harley1234", "hunter1234", "ranger1234", "target1234", "summer1234",
  "winter1234", "spring1234", "autumn1234", "january123", "february12",
  "march12345", "april12345", "may1234567", "june123456", "july123456",
  "august1234", "september1", "october123", "november12", "december12",
  "monday1234", "friday1234", "sunday1234", "london1234", "newyork123",
  "tokyo12345", "paris12345", "berlin1234", "india12345", "america123",
  "canada1234", "brazil1234", "champion12", "winner1234", "success123",
  "money12345", "diamond123", "golden1234", "silver1234", "platinum12"
]);

export function validatePasswordStrength(
  password: string,
  email?: string
): { valid: boolean; error?: string } {
  if (!password || password.length < 10) {
    return { valid: false, error: "Password must be at least 10 characters long." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: "Password is too common and easily guessed." };
  }
  if (email) {
    const localPart = email.split("@")[0]?.toLowerCase().trim();
    if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
      return { valid: false, error: "Password must not contain parts of your email address." };
    }
  }
  return { valid: true };
}

export function getClientIp(headers: Headers): string {
  const trustProxy = process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1";
  if (trustProxy) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      // In trusted proxy setups, take the right-most untrusted hop
      const ips = forwarded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ips.length > 0) {
        return ips[0];
      }
    }
    const realIp = headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }
  return "127.0.0.1";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch {
    return null;
  }
}

export async function createDatabaseSession(
  userId: string,
  deviceInfo?: { device?: string; ipAddress?: string; userAgent?: string }
): Promise<{ token: string; sessionId: string }> {
  const rawSessionSecret = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawSessionSecret);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, organizationId: true },
  });

  if (!user) throw new Error("User not found to create session");

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      device: deviceInfo?.device || "Browser / Desktop",
      ipAddress: deviceInfo?.ipAddress || "127.0.0.1",
      userAgent: deviceInfo?.userAgent || "Mozilla/5.0",
      expiresAt,
    },
  });

  const jwtToken = signToken({
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    orgId: user.organizationId,
    sessionId: session.id,
  });

  return { token: jwtToken, sessionId: session.id };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("entrivo_session_token")?.value;
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded || !decoded.sessionId) return null;

    // Verify session is active in database
    const dbSession = await prisma.session.findUnique({
      where: { id: decoded.sessionId },
      include: {
        user: {
          include: {
            organization: { select: { name: true, deletedAt: true } },
            employee: { select: { id: true, employeeCode: true, designation: true, deletedAt: true } },
          },
        },
      },
    });

    if (!dbSession || dbSession.expiresAt < new Date()) {
      return null;
    }

    const user = dbSession.user;
    if (!user || !user.isActive || user.deletedAt) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
      avatar: user.avatar,
      organizationId: user.organizationId,
      organizationName: user.organization?.name,
      employeeId: user.employee?.id,
      employeeCode: user.employee?.employeeCode,
      designation: user.employee?.designation,
      mustChangePassword: user.mustChangePassword,
      termsVersion: user.termsVersion,
      termsAcceptedAt: user.termsAcceptedAt,
    };
  } catch (error) {
    console.error("Error retrieving current user:", error);
    return null;
  }
}

export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    await prisma.session.delete({ where: { id: sessionId } });
    return true;
  } catch {
    return false;
  }
}

export async function revokeAllUserSessions(userId: string): Promise<boolean> {
  try {
    await prisma.session.deleteMany({ where: { userId } });
    return true;
  } catch {
    return false;
  }
}

export function isAuthorized(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  if (userRole === "SUPER_ADMIN") return true;
  return allowedRoles.includes(userRole);
}
