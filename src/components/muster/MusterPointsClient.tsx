"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { ChevronLeft, MapPin, Pencil, Plus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const pointSchema = z.object({
  id: z.string(),
  officeId: z.string(),
  name: z.string(),
  location: z.string(),
  isActive: z.boolean(),
  office: z.object({ id: z.string(), name: z.string() }),
});
const pointsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(pointSchema),
});
const pointFormSchema = z.object({
  officeId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(500),
});

type Office = { id: string; name: string };
type MusterPoint = z.infer<typeof pointSchema>;
type PointForm = z.infer<typeof pointFormSchema>;

export function MusterPointsClient({
  offices,
  canManage,
}: {
  offices: Office[];
  canManage: boolean;
}) {
  const t = useTranslations("muster");
  const [points, setPoints] = useState<MusterPoint[]>([]);
  const [form, setForm] = useState<PointForm>({
    officeId: offices[0]?.id ?? "",
    name: "",
    location: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<MusterPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const query = canManage ? "?includeInactive=true" : "";
      const response = await fetch(`/api/muster/points${query}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(t("pointsLoadFailed"));
      setPoints(pointsResponseSchema.parse(body).data);
      setError("");
    } catch {
      setError(t("pointsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearForm = () => {
    setEditingId(null);
    setForm({ officeId: offices[0]?.id ?? "", name: "", location: "" });
  };

  const editPoint = (point: MusterPoint) => {
    setEditingId(point.id);
    setForm({ officeId: point.officeId, name: point.name, location: point.location });
    setError("");
  };

  const savePoint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    const parsed = pointFormSchema.safeParse(form);
    if (!parsed.success) {
      setError(t("pointsInvalidForm"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId ? `/api/muster/points/${encodeURIComponent(editingId)}` : "/api/muster/points",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        }
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body ? String(body.error) : t("pointsSaveFailed");
        throw new Error(message);
      }
      clearForm();
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("pointsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const togglePoint = async (point: MusterPoint, active: boolean) => {
    setSaving(true);
    setError("");
    try {
      const response = active
        ? await fetch(`/api/muster/points/${encodeURIComponent(point.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          })
        : await fetch(`/api/muster/points/${encodeURIComponent(point.id)}`, { method: "DELETE" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body ? String(body.error) : t("pointsUpdateFailed");
        throw new Error(message);
      }
      setPendingDeactivation(null);
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("pointsUpdateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      <header>
        <Link href="/muster" className="mb-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted hover:text-text">
          <ChevronLeft className="h-4 w-4" /> {t("backToMuster")}
        </Link>
        <h1 className="text-2xl font-extrabold text-text">{t("pointsTitle")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("pointsDescription")}</p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200">{error}</p>}

      {canManage && (
        <form onSubmit={savePoint} className="grid gap-3 rounded-2xl border border-surface-border bg-surface-glass p-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-text-muted">
            {t("pointsName")}
            <input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-text-muted">
            {t("pointsLocation")}
            <input required minLength={2} maxLength={500} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-text-muted md:col-span-2">
            {t("pointsOffice")}
            <select required value={form.officeId} onChange={(event) => setForm((current) => ({ ...current, officeId: event.target.value }))} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text">
              <option value="">{t("pointsSelectOffice")}</option>
              {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" disabled={saving || !offices.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> {saving ? t("pointsSaving") : editingId ? t("pointsSaveChanges") : t("pointsCreate")}
            </button>
            {editingId && (
              <button type="button" disabled={saving} onClick={clearForm} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-surface-border px-4 text-sm font-bold text-text">
                <X className="h-4 w-4" /> {t("cancel")}
              </button>
            )}
          </div>
        </form>
      )}

      <section className="space-y-3">
        {points.map((point) => (
          <article key={point.id} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-glass p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <h2 className="font-bold text-text">{point.name}</h2>
                <p className="text-xs text-text-muted">{point.location} · {point.office.name}</p>
                <p className={`mt-1 text-xs font-semibold ${point.isActive ? "text-emerald-300" : "text-text-muted"}`}>
                  {point.isActive ? t("pointsActive") : t("pointsInactive")}
                </p>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={saving} onClick={() => editPoint(point)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-border px-3 text-xs font-bold text-text disabled:opacity-50">
                  <Pencil className="h-4 w-4" /> {t("pointsEdit")}
                </button>
                {point.isActive ? (
                  <button type="button" disabled={saving} onClick={() => setPendingDeactivation(point)} className="min-h-10 rounded-lg border border-amber-500/40 px-3 text-xs font-bold text-amber-200 disabled:opacity-50">
                    {t("pointsDeactivate")}
                  </button>
                ) : (
                  <button type="button" disabled={saving} onClick={() => void togglePoint(point, true)} className="min-h-10 rounded-lg border border-emerald-500/40 px-3 text-xs font-bold text-emerald-200 disabled:opacity-50">
                    {t("pointsActivate")}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {!loading && points.length === 0 && <p className="rounded-xl border border-surface-border p-8 text-center text-sm text-text-muted">{t("pointsEmpty")}</p>}
        {loading && <p role="status" className="text-center text-xs text-text-muted">{t("pointsLoading")}</p>}
      </section>

      <ConfirmDialog
        isOpen={pendingDeactivation !== null}
        onClose={() => setPendingDeactivation(null)}
        onConfirm={() => {
          if (pendingDeactivation) void togglePoint(pendingDeactivation, false);
        }}
        title={t("pointsDeactivateTitle")}
        description={t("pointsDeactivateDescription")}
        confirmLabel={t("pointsDeactivate")}
        cancelLabel={t("cancel")}
        variant="warning"
        isLoading={saving}
      />
    </main>
  );
}
