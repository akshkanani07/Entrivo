import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { CurrentUser, UserRole } from "@/types";
import { prisma } from "./db";
import {
  Permission,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  canAssignRole,
} from "./rbac-base";

export * from "./rbac-base";

export type AuthResult =
  | { user: CurrentUser; response?: never }
  | { user?: never; response: NextResponse };

export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  return { user };
}

export async function requirePermission(perm: Permission): Promise<AuthResult> {
  const auth = await requireUser();
  if (auth.response) return auth;

  if (!can(auth.user, perm)) {
    return {
      response: NextResponse.json(
        { success: false, error: `Forbidden: missing permission '${perm}'` },
        { status: 403 }
      ),
    };
  }
  return { user: auth.user };
}

export async function requireAnyPermission(perms: Permission[]): Promise<AuthResult> {
  const auth = await requireUser();
  if (auth.response) return auth;

  const hasAny = perms.some((p) => can(auth.user, p));
  if (!hasAny) {
    return {
      response: NextResponse.json(
        { success: false, error: `Forbidden: requires one of [${perms.join(", ")}]` },
        { status: 403 }
      ),
    };
  }
  return { user: auth.user };
}

export async function requirePagePermission(perm: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!can(user, perm)) {
    redirect("/forbidden");
  }
  return user;
}

export async function requireAnyPagePermission(perms: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const hasAny = perms.some((p) => can(user, p));
  if (!hasAny) {
    redirect("/forbidden");
  }
  return user;
}

export async function validateRoleChange(
  caller: CurrentUser,
  targetUserId: string,
  newRole: UserRole,
  orgId: string
): Promise<{ ok: boolean; allowed: boolean; error?: string }> {
  if (caller.id === targetUserId) {
    return { ok: false, allowed: false, error: "Users cannot change their own administrative role." };
  }

  if (!canAssignRole(caller.role, newRole)) {
    return {
      ok: false,
      allowed: false,
      error: `Role '${caller.role}' is not authorized to assign role '${newRole}'. Only SUPER_ADMIN can assign SUPER_ADMIN.`,
    };
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: orgId },
  });

  if (!target) {
    return { ok: false, allowed: false, error: "Target user not found in this organization." };
  }

  if (target.role === "ORG_ADMIN" && newRole !== "ORG_ADMIN") {
    const adminCount = await prisma.user.count({
      where: { organizationId: orgId, role: "ORG_ADMIN", isActive: true },
    });
    if (adminCount <= 1) {
      return {
        ok: false,
        allowed: false,
        error: "Cannot demote the last remaining ORG_ADMIN of an organization. Promote another user first.",
      };
    }
  }

  return { ok: true, allowed: true };
}
