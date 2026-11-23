import { z } from "zod";
import { normalizeVisitorEmail, normalizeVisitorPhone } from "./visitor-dedupe";

export const BULK_CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "company",
  "purpose",
  "date",
  "start",
  "end",
  "visitor_type",
  "vehicle",
] as const;

const noMarkup = (value: string) => !/[<>]/.test(value);
const csvRowSchema = z.object({
  name: z.string().trim().min(1).max(120).refine(noMarkup),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(30).refine(noMarkup),
  company: z.string().trim().max(120).refine(noMarkup),
  purpose: z.string().trim().min(1).max(300).refine(noMarkup),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  visitor_type: z.string().trim().max(100).refine(noMarkup),
  vehicle: z.string().trim().max(40).refine(noMarkup),
});

export type BulkCsvRow = z.infer<typeof csvRowSchema>;

export interface ParsedCsvRow {
  rowNumber: number;
  data: BulkCsvRow | null;
  errors: string[];
}

export interface ParsedGroupCsvRow {
  rowNumber: number;
  data: { name: string; email: string; phone: string; company?: string } | null;
  errors: string[];
}

function stripFormulaPrefix(value: string): string {
  return value.trim().replace(/^[=+\-@]+/, "").trim();
}

function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseInvitationCsv(input: string, maxRows: number): ParsedCsvRow[] {
  const records = parseCsvRecords(input);
  if (!records.length) throw new Error("CSV is empty.");
  const headers = records[0].map((header) => stripFormulaPrefix(header).toLowerCase());
  const missing = BULK_CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
  const positions = BULK_CSV_HEADERS.map((header) => headers.indexOf(header));
  const inputRows = records.slice(1);
  if (inputRows.length > maxRows) {
    throw new Error(`CSV exceeds the ${maxRows}-row organization limit.`);
  }

  const emailRows = new Map<string, number>();
  const phoneRows = new Map<string, number>();
  return inputRows.map((values, index) => {
    const raw = Object.fromEntries(
      BULK_CSV_HEADERS.map((header, columnIndex) => [
        header,
        stripFormulaPrefix(values[positions[columnIndex]] ?? ""),
      ])
    );
    const parsed = csvRowSchema.safeParse(raw);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

    if (parsed.success) {
      const email = normalizeVisitorEmail(parsed.data.email);
      const phone = normalizeVisitorPhone(parsed.data.phone);
      const previousEmailRow = emailRows.get(email);
      const previousPhoneRow = phoneRows.get(phone);
      if (previousEmailRow || previousPhoneRow) {
        errors.push(
          `Duplicate visitor contact in this file (first seen on row ${previousEmailRow || previousPhoneRow}).`
        );
      } else {
        emailRows.set(email, index + 2);
        phoneRows.set(phone, index + 2);
      }
    }

    return {
      rowNumber: index + 2,
      data: parsed.success ? parsed.data : null,
      errors,
    };
  });
}

export function parseGroupVisitorCsv(input: string, maxRows: number): ParsedGroupCsvRow[] {
  const records = parseCsvRecords(input);
  if (!records.length) throw new Error("CSV is empty.");
  const headers = records[0].map((header) => stripFormulaPrefix(header).toLowerCase());
  const requiredHeaders = ["name", "email", "phone"];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Group CSV is missing required columns: ${missing.join(", ")}.`);
  const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
  const rows = records.slice(1);
  if (rows.length > maxRows) throw new Error(`CSV exceeds the ${maxRows}-visitor group limit.`);

  const schema = z.object({
    name: z.string().trim().min(1).max(120).refine(noMarkup),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(5).max(30).refine(noMarkup),
    company: z.string().trim().max(120).refine(noMarkup).optional(),
  });
  const emails = new Set<string>();
  const phones = new Set<string>();
  return rows.map((values, index) => {
    const raw = Object.fromEntries(
      ["name", "email", "phone", "company"].flatMap((header) =>
        positions[header] === undefined
          ? []
          : [[header, stripFormulaPrefix(values[positions[header]] ?? "")]]
      )
    );
    const parsed = schema.safeParse(raw);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    if (parsed.success) {
      const email = normalizeVisitorEmail(parsed.data.email);
      const phone = normalizeVisitorPhone(parsed.data.phone);
      if (emails.has(email) || phones.has(phone)) {
        errors.push("Duplicate visitor email or phone in this file.");
      } else {
        emails.add(email);
        phones.add(phone);
      }
    }
    return { rowNumber: index + 2, data: parsed.success ? parsed.data : null, errors };
  });
}

export function escapeCsvCell(value: string): string {
  const safe = stripFormulaPrefix(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildErrorReport(rows: Array<{ rowNumber: number; errors: string[] }>): string {
  return [
    "row,errors",
    ...rows.map((row) =>
      `${row.rowNumber},${escapeCsvCell(row.errors.join("; "))}`
    ),
  ].join("\r\n");
}

export function csvTemplate(): string {
  return `${BULK_CSV_HEADERS.join(",")}\r\n`;
}

export function groupCsvTemplate(): string {
  return "name,email,phone,company\r\n";
}
