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

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  return { valid: true };
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
