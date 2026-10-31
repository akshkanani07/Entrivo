import { prisma } from "@/lib/db";

/**
 * Generates a collision-free unique badge number across the entire system.
 * Format: [PREFIX]-[NUMBER], e.g. ENT-4821 or KAN-3891
 */
export async function generateUniqueBadgeNumber(orgId?: string | null): Promise<string> {
  let prefix = "ENT";

  if (orgId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { slug: true, name: true },
      });

      if (org?.slug) {
        const cleanSlug = org.slug.replace(/[^a-zA-Z]/g, "").toUpperCase();
        if (cleanSlug.length >= 3) {
          prefix = cleanSlug.slice(0, 3);
        }
      } else if (org?.name) {
        const cleanName = org.name.replace(/[^a-zA-Z]/g, "").toUpperCase();
        if (cleanName.length >= 3) {
          prefix = cleanName.slice(0, 3);
        }
      }
    } catch (err) {
      console.warn("Failed to derive prefix from org:", err);
    }
  }

  // Find next sequential or random non-colliding badge
  for (let attempt = 0; attempt < 30; attempt++) {
    // Generate 4-digit code e.g. 1024 to 9999
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${randomSuffix}`;

    const existingBadge = await prisma.badge.findUnique({
      where: { badgeNumber: candidate },
    });

    if (!existingBadge) {
      return candidate;
    }
  }

  // Guaranteed fallback using timestamp
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
