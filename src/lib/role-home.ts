import type { UserRole } from "@/types";

export function getRoleHome(_role: UserRole) {
  return "/";
}

export async function getRoleHomeFromSession() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return "/";
    const data = await response.json();
    return data.user?.role ? getRoleHome(data.user.role as UserRole) : "/";
  } catch {
    return "/";
  }
}
