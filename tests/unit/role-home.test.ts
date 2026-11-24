import { describe, expect, it } from "vitest";
import { getRoleHome } from "@/lib/role-home";
import type { UserRole } from "@/types";

describe("getRoleHome", () => {
  it.each<UserRole>(["SUPER_ADMIN", "ORG_ADMIN", "RECEPTIONIST", "SECURITY_GUARD", "EMPLOYEE"])(
    "opens the shared role dashboard for %s",
    (role) => {
      expect(getRoleHome(role)).toBe("/");
    }
  );
});
