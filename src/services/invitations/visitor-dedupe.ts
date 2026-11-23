import { Prisma, Visitor } from "@prisma/client";

export interface VisitorIdentity {
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  visitorTypeId?: string | null;
}

export function normalizeVisitorEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeVisitorPhone(value: string): string {
  return value.replace(/\D/g, "");
}

export async function findOrCreateVisitor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  identity: VisitorIdentity
): Promise<Visitor> {
  const email = normalizeVisitorEmail(identity.email);
  const phone = normalizeVisitorPhone(identity.phone);
  const matches = await tx.$queryRaw<Visitor[]>`
    SELECT *
    FROM "Visitor"
    WHERE "organizationId" = ${organizationId}
      AND (
        lower("email") = ${email}
        OR regexp_replace("phone", '[^0-9]', '', 'g') = ${phone}
      )
    ORDER BY CASE WHEN lower("email") = ${email} THEN 0 ELSE 1 END
    LIMIT 1
  `;
  if (matches[0]) return matches[0];

  return tx.visitor.create({
    data: {
      organizationId,
      name: identity.name.trim(),
      email,
      phone: identity.phone.trim(),
      company: identity.company?.trim() || "Guest",
      visitorTypeId: identity.visitorTypeId || null,
    },
  });
}
