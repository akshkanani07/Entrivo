import { describe, expect, it } from "vitest";
import {
  buildMusterReportTimeline,
  containsNonLatinCharacters,
  decodeMusterEventCursor,
  encodeMusterEventCursor,
  getMusterEventCursorFilter,
  paginateMusterEvents,
  sanitizeMusterCsvCell,
} from "@/services/muster/muster-reporting";

describe("muster reporting helpers", () => {
  it("quotes CSV values and neutralizes all supported formula prefixes", () => {
    for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(sanitizeMusterCsvCell(`${prefix}1+1`)).toBe(`"'${prefix === "\t" || prefix === "\r" ? "1+1" : `${prefix}1+1`}"`);
    }

    expect(sanitizeMusterCsvCell('Guest, "Visitor"')).toBe('"Guest, ""Visitor"""');
    expect(sanitizeMusterCsvCell(null)).toBe('""');
    expect(sanitizeMusterCsvCell("  =SUM(A1:A2)")).toBe("\"'=SUM(A1:A2)\"");
  });

  it("detects non-Latin scripts while allowing Latin text and common punctuation", () => {
    expect(containsNonLatinCharacters("Visitor: José - 123")).toBe(false);
    expect(containsNonLatinCharacters("અતિથિ")).toBe(true);
    expect(containsNonLatinCharacters("अतिथि")).toBe(true);
  });

  it("builds a chronological timeline with subject and actor names", () => {
    const timeline = buildMusterReportTimeline([
      {
        id: "entry-1",
        snapshot: { name: "Visitor One" },
        actions: [
          {
            id: "action-2",
            status: "SAFE",
            accountedAt: "2026-11-25T10:02:00.000Z",
            accountedBy: { name: "Guard Two" },
            musterPoint: { name: "North Point" },
            note: null,
          },
          {
            id: "action-1",
            status: "MISSING",
            accountedAt: "2026-11-25T10:01:00.000Z",
            accountedBy: { name: "Guard One" },
            musterPoint: null,
            note: "Last seen near lobby",
          },
        ],
      },
    ]);

    expect(timeline.map(({ id, personName, accountedBy, status }) => ({
      id,
      personName,
      actor: accountedBy?.name,
      status,
    }))).toEqual([
      { id: "action-1", personName: "Visitor One", actor: "Guard One", status: "MISSING" },
      { id: "action-2", personName: "Visitor One", actor: "Guard Two", status: "SAFE" },
    ]);
  });

  it("round-trips an opaque cursor with both sort fields and paginates equal timestamps", () => {
    const startedAt = new Date("2026-11-25T10:00:00.000Z");
    const cursor = { id: "event-b", startedAt };
    const opaque = encodeMusterEventCursor(cursor);
    expect(opaque).not.toContain("event-b");
    expect(decodeMusterEventCursor(opaque)).toEqual(cursor);
    expect(decodeMusterEventCursor("not-a-cursor")).toBeNull();
    expect(getMusterEventCursorFilter(cursor)).toEqual({
      OR: [
        { startedAt: { lt: startedAt } },
        { startedAt, id: { lt: "event-b" } },
      ],
    });

    const result = paginateMusterEvents(
      [
        { id: "event-c", startedAt },
        { id: "event-b", startedAt },
        { id: "event-a", startedAt },
      ],
      2
    );
    expect(result.rows.map((row) => row.id)).toEqual(["event-c", "event-b"]);
    expect(decodeMusterEventCursor(result.nextCursor ?? "")).toEqual(cursor);
  });
});
