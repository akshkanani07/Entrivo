import { z } from "zod";
import type { MusterStatus } from "@/services/muster/muster-core";

const cursorPayloadSchema = z.object({
  id: z.string().trim().min(1).max(128),
  startedAt: z.string().datetime(),
});

export interface MusterEventCursor {
  id: string;
  startedAt: Date;
}

export interface MusterTimelineAction {
  id: string;
  status: MusterStatus;
  accountedAt: Date | string;
  accountedBy: { name: string } | null;
  musterPoint: { name: string } | null;
  note: string | null;
}

export interface MusterTimelineEntry {
  id: string;
  snapshot: unknown;
  actions: MusterTimelineAction[];
}

export interface MusterTimelineItem extends MusterTimelineAction {
  entryId: string;
  personName: string | null;
}

function getSnapshotName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const name = (snapshot as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

export function sanitizeMusterCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const trimmed = raw.trim();
  const dangerous = /^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(trimmed);
  const safe = dangerous ? `'${trimmed}` : trimmed;
  return `"${safe.replace(/"/g, '""')}"`;
}

const latinCommonOrInherited =
  /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]$/u;

export function containsNonLatinCharacters(value: string): boolean {
  return Array.from(value).some((character) => !latinCommonOrInherited.test(character));
}

export function buildMusterReportTimeline(
  entries: MusterTimelineEntry[]
): MusterTimelineItem[] {
  return entries
    .flatMap((entry) => {
      const personName = getSnapshotName(entry.snapshot);
      return entry.actions.map((action) => ({
        ...action,
        entryId: entry.id,
        personName,
      }));
    })
    .sort((left, right) => {
      const timeDifference =
        new Date(left.accountedAt).getTime() - new Date(right.accountedAt).getTime();
      return timeDifference || left.id.localeCompare(right.id);
    });
}

export function encodeMusterEventCursor(cursor: MusterEventCursor): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ id: cursor.id, startedAt: cursor.startedAt.toISOString() })
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeMusterEventCursor(value: string): MusterEventCursor | null {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null;

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    const parsed = cursorPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      id: parsed.data.id,
      startedAt: new Date(parsed.data.startedAt),
    };
  } catch {
    return null;
  }
}

export function getMusterEventCursorFilter(cursor: MusterEventCursor) {
  return {
    OR: [
      { startedAt: { lt: cursor.startedAt } },
      { startedAt: cursor.startedAt, id: { lt: cursor.id } },
    ],
  };
}

export function paginateMusterEvents<T extends { id: string; startedAt: Date }>(
  rows: T[],
  limit: number
): { rows: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: hasMore && last
      ? encodeMusterEventCursor({ id: last.id, startedAt: last.startedAt })
      : null,
  };
}
