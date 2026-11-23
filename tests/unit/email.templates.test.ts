import { describe, expect, it } from "vitest";
import {
  buildEmailTemplateSamples,
  EMAIL_TEMPLATE_NAMES,
  formatEmailDateTime,
  renderBrandedEmailLayout,
} from "@/services/email/email.templates";

describe("branded email templates", () => {
  it("renders every template safely with an HTML-escaped organization name and plain text", () => {
    const unsafeName = '<img src=x onerror="alert(1)">';
    const templates = buildEmailTemplateSamples("preview@example.com", unsafeName);

    for (const name of EMAIL_TEMPLATE_NAMES) {
      const email = templates[name];
      expect(email.htmlContent, name).toContain("&lt;img");
      expect(email.htmlContent, name).not.toContain(unsafeName);
      expect(email.htmlContent, name).not.toMatch(/undefined|NaN|\[object Object\]/);
      expect(email.textContent, name).toBeTruthy();
      expect(email.textContent, name).not.toMatch(/undefined|NaN|\[object Object\]/);
    }
  });

  it("uses email-client-safe tables, inline styles, and an Outlook CTA fallback", () => {
    const html = renderBrandedEmailLayout({
      title: "Test email",
      tag: "Test",
      contentHtml: '<p style="color:#172033">Hello</p>',
      actionButton: { text: "Open", url: "https://example.com/action" },
      organizationName: "Example",
    });

    expect(html).toContain("<table");
    expect(html).toContain("<!--[if mso]>");
    expect(html).toContain("<!--[if !mso]>");
    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/\sclass=/i);
    expect(html).toContain("max-width:600px");
  });

  it("formats timestamps in the requested organization timezone", () => {
    expect(
      formatEmailDateTime("2026-03-10T00:30:00.000Z", "America/Los_Angeles", "date")
    ).toContain("March 9");
    expect(formatEmailDateTime("10:05", "Asia/Kolkata", "time")).toMatch(/10:05/);
  });
});
