import { describe, it, expect } from "vitest";
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  canAssignRole,
  Permission,
} from "@/lib/rbac-base";
import { UserRole } from "@/types";

describe("RBAC Permissions & Roles Matrix", () => {
  it("defines all required permissions in ALL_PERMISSIONS", () => {
    expect(ALL_PERMISSIONS).toBeDefined();
    expect(ALL_PERMISSIONS.length).toBeGreaterThan(30);

    const corePermissions: Permission[] = [
      "dashboard.view",
      "visitors.read",
      "visitors.write",
      "invitations.create",
      "checkin.perform",
      "checkout.perform",
      "approvals.act",
      "blacklist.read",
      "employees.read",
      "settings.manage",
      "webhooks.manage",
      "apikeys.manage",
    ];

    for (const p of corePermissions) {
      expect(ALL_PERMISSIONS).toContain(p);
    }
  });

  it("grants SUPER_ADMIN access to every permission implicitly", () => {
    const superAdmin = { role: "SUPER_ADMIN" as UserRole };
    for (const perm of ALL_PERMISSIONS) {
      expect(can(superAdmin, perm)).toBe(true);
    }
  });

  it("enforces strict role boundaries for EMPLOYEE", () => {
    const employee = { role: "EMPLOYEE" as UserRole };

    // Employee allowed permissions
    expect(can(employee, "invitations.create")).toBe(true);
    expect(can(employee, "invitations.read.own")).toBe(true);
    expect(can(employee, "approvals.act")).toBe(true);
    expect(can(employee, "employees.read")).toBe(true);

    // Employee denied permissions
    expect(can(employee, "visitors.delete")).toBe(false);
    expect(can(employee, "settings.manage")).toBe(false);
    expect(can(employee, "apikeys.manage")).toBe(false);
    expect(can(employee, "webhooks.manage")).toBe(false);
    expect(can(employee, "blacklist.manage")).toBe(false);
  });

  it("enforces strict role boundaries for RECEPTIONIST", () => {
    const receptionist = { role: "RECEPTIONIST" as UserRole };

    expect(can(receptionist, "checkin.perform")).toBe(true);
    expect(can(receptionist, "checkout.perform")).toBe(true);
    expect(can(receptionist, "walkin.create")).toBe(true);
    expect(can(receptionist, "visitors.read")).toBe(true);

    // Receptionist denied
    expect(can(receptionist, "settings.manage")).toBe(false);
    expect(can(receptionist, "apikeys.manage")).toBe(false);
    expect(can(receptionist, "org.manage")).toBe(false);
  });

  it("denies access when user is null or undefined", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "dashboard.view")).toBe(false);
  });

  describe("canAssignRole Privilege Escalation Guards", () => {
    it("allows SUPER_ADMIN to assign any role", () => {
      expect(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
      expect(canAssignRole("SUPER_ADMIN", "ORG_ADMIN")).toBe(true);
      expect(canAssignRole("SUPER_ADMIN", "EMPLOYEE")).toBe(true);
    });

    it("allows ORG_ADMIN to assign roles except SUPER_ADMIN", () => {
      expect(canAssignRole("ORG_ADMIN", "ORG_ADMIN")).toBe(true);
      expect(canAssignRole("ORG_ADMIN", "SECURITY_GUARD")).toBe(true);
      expect(canAssignRole("ORG_ADMIN", "RECEPTIONIST")).toBe(true);
      expect(canAssignRole("ORG_ADMIN", "EMPLOYEE")).toBe(true);

      // Cannot elevate to SUPER_ADMIN
      expect(canAssignRole("ORG_ADMIN", "SUPER_ADMIN")).toBe(false);
    });

    it("blocks non-admin roles from assigning any role", () => {
      const nonAdmins: UserRole[] = ["SECURITY_GUARD", "RECEPTIONIST", "EMPLOYEE"];
      for (const role of nonAdmins) {
        expect(canAssignRole(role, "EMPLOYEE")).toBe(false);
        expect(canAssignRole(role, "RECEPTIONIST")).toBe(false);
        expect(canAssignRole(role, "ORG_ADMIN")).toBe(false);
      }
    });
  });
});

