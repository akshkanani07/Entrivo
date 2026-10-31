import { NextResponse } from "next/server";
import { CurrentUser } from "@/types";

export type TenantResult =
  | { organizationId: string; response?: never }
  | { organizationId?: never; response: NextResponse };

/**
 * Ensures that the current user has a valid organization context.
 * Super admins without an organization return a 403 or explicit error when accessing tenant-scoped routes.
 * Tenant routes must NEVER fall back to querying all organizations.
 */
export function requireOrg(user: CurrentUser | null | undefined): TenantResult {
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  if (!user.organizationId) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Tenant context required: User is not associated with an organization.",
        },
        { status: 403 }
      ),
    };
  }

  return { organizationId: user.organizationId };
}

