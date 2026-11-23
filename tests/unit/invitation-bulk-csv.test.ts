import { describe, expect, it } from "vitest";
import {
  buildErrorReport,
  parseGroupVisitorCsv,
  parseInvitationCsv,
} from "@/services/invitations/bulk-csv";

describe("bulk invitation CSV parsing", () => {
  const headers = "name,email,phone,company,purpose,date,start,end,visitor_type,vehicle";

  it("accepts UTF-8 BOM, quoted commas, and strips formula prefixes", () => {
    const [row] = parseInvitationCsv(
      `\uFEFF${headers}\r\n=Rae,"rae@example.com",+15555550123,"Acme, Inc",Meeting,2026-12-01,10:00,11:00,,`,
      10
    );
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      name: "Rae",
      email: "rae@example.com",
      company: "Acme, Inc",
      date: "2026-12-01",
    });
  });

  it("reports duplicate normalized email or phone values within one file", () => {
    const rows = parseInvitationCsv(
      `${headers}\nRae,rae@example.com,+1 (555) 555-0123,Acme,Meeting,2026-12-01,10:00,11:00,,\nRay,RAE@example.com,5555550124,Acme,Meeting,2026-12-02,10:00,11:00,,\nRia,ria@example.com,15555550123,Acme,Meeting,2026-12-03,10:00,11:00,,`,
      10
    );
    expect(rows[1].errors.join(" ")).toContain("Duplicate visitor contact");
    expect(rows[2].errors.join(" ")).toContain("Duplicate visitor contact");
  });

  it("escapes formula prefixes in error reports", () => {
    const report = buildErrorReport([{ rowNumber: 2, errors: ["=SUM(A1:A2)"] }]);
    expect(report).toBe('row,errors\r\n2,"SUM(A1:A2)"');
  });

  it("parses group member rows with row-level duplicate and markup validation", () => {
    const rows = parseGroupVisitorCsv(
      "name,email,phone,company\nOne,one@example.com,15555550123,Acme\nTwo,ONE@example.com,15555550124,Acme\nThree,three@example.com,15555550125,<script>",
      50
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors.join(" ")).toContain("Duplicate visitor");
    expect(rows[2].errors.join(" ")).toContain("company");
  });
});
