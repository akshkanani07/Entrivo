import { requirePagePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { applyEmailBranding, buildEmailTemplateSamples } from "@/services/email/email.templates";
import { EmailPreviewClient } from "./EmailPreviewClient";

export const dynamic = "force-dynamic";

export default async function EmailPreviewPage() {
  const user = await requirePagePermission("templates.manage");
  const organization = user.organizationId
    ? await prisma.organization.findFirst({
        where: { id: user.organizationId },
        select: { name: true, logo: true, contactEmail: true },
      })
    : null;
  const samples = buildEmailTemplateSamples(
    "preview@example.com",
    organization?.name || user.organizationName || "Entrivo Workplace"
  );
  const templates = Object.entries(samples).map(([name, email]) => ({
    name,
    subject: email.subject,
    html: applyEmailBranding(email, {
      name: organization?.name || user.organizationName || "Entrivo Workplace",
      logo: organization?.logo,
      contactEmail: organization?.contactEmail,
    }).htmlContent,
    text: email.textContent || "",
  }));

  return <EmailPreviewClient templates={templates} />;
}
