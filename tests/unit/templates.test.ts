import { describe, it, expect } from "vitest";
import {
  interpolateVariables,
  ALLOWED_TEMPLATE_VARIABLES,
} from "@/services/notifications/template-engine";

describe("Notification Template Engine (interpolateVariables)", () => {
  it("includes all required variables in ALLOWED_TEMPLATE_VARIABLES", () => {
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("visitor_name");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("host_name");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("date");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("time");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("location");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("purpose");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("company_name");
    expect(ALLOWED_TEMPLATE_VARIABLES).toContain("qr_link");
  });

  it("replaces exact variable placeholders", () => {
    const template = "Hello {{visitor_name}}, your host is {{host_name}}.";
    const vars = {
      visitor_name: "Rahul Verma",
      host_name: "Pooja Patel",
    };

    const rendered = interpolateVariables(template, vars);
    expect(rendered).toBe("Hello Rahul Verma, your host is Pooja Patel.");
  });

  it("handles whitespace variations inside brackets (e.g. {{ visitor_name }})", () => {
    const template = "Access pass for {{  visitor_name  }} on {{ date }}.";
    const vars = {
      visitor_name: "John Doe",
      date: "2026-11-15",
    };

    const rendered = interpolateVariables(template, vars);
    expect(rendered).toBe("Access pass for John Doe on 2026-11-15.");
  });

  it("preserves unrecognized placeholders without throwing errors", () => {
    const template = "Hello {{visitor_name}}, custom info: {{unrecognized_token}}.";
    const vars = {
      visitor_name: "Alice",
    };

    const rendered = interpolateVariables(template, vars);
    expect(rendered).toBe("Hello Alice, custom info: {{unrecognized_token}}.");
  });

  it("handles empty strings and null gracefully", () => {
    expect(interpolateVariables("", { visitor_name: "Alice" })).toBe("");
    expect(interpolateVariables("No variables here", {})).toBe("No variables here");
  });
});

