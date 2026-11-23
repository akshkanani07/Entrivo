"use strict";
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Company = {
  id: string;
  name: string;
  gstin: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED";
  contractStart: string | null;
  contractEnd: string | null;
  sponsorEmployee: { user: { id: string; name: string; email: string } };
  workers: Array<{ id: string; trade: string | null; status: string; visitor: { name: string; email: string } }>;
  documents: Array<{ id: string; docType: string; expiryDate: string | null; status: string }>;
};

export function ContractorManagementClient({ canManage, canOverride }: { canManage: boolean; canOverride: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [sponsorEmployeeId, setSponsorEmployeeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/contractors", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load contractors.");
      setCompanies(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load contractors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createCompany() {
    if (!canManage) return;
    const response = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        gstin: gstin || undefined,
        contactEmail: contactEmail || undefined,
        sponsorEmployeeId,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) toast.error(result.error || "Unable to create contractor.");
    else {
      toast.success("Contractor company created.");
      setName("");
      setGstin("");
      setContactEmail("");
      await load();
    }
  }

  async function setStatus(company: Company, status: "ACTIVE" | "SUSPENDED" | "BLOCKED") {
    const reason = window.prompt(`Reason for changing ${company.name} to ${status}:`);
    if (!reason) return;
    const response = await fetch(`/api/contractors/${company.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) toast.error(result.error || "Unable to update company.");
    else await load();
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contractors</h1>
        <p className="text-sm text-slate-500">Company compliance, workers, permits, and inductions</p>
      </div>

      {canManage && (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-5">
          <input className="rounded-lg border p-2 text-sm" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded-lg border p-2 text-sm" placeholder="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} />
          <input className="rounded-lg border p-2 text-sm" placeholder="Contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <input className="rounded-lg border p-2 text-sm" placeholder="Sponsor employee ID" value={sponsorEmployeeId} onChange={(e) => setSponsorEmployeeId(e.target.value)} />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white" onClick={createCompany}>Create company</button>
        </section>
      )}

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {companies.map((company) => (
            <section key={company.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">{company.name}</h2>
                  <p className="text-xs text-slate-500">Sponsor: {company.sponsorEmployee.user.name}</p>
                </div>
                <span className="rounded-full border px-2 py-1 text-xs font-bold">{company.status}</span>
              </div>
              <div className="mt-4 text-sm text-slate-600">
                <p>{company.workers.length} workers</p>
                <p>{company.documents.length} company documents</p>
              </div>
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {company.status !== "ACTIVE" && <button className="rounded border px-2 py-1 text-xs" onClick={() => setStatus(company, "ACTIVE")}>Activate</button>}
                  {company.status !== "SUSPENDED" && <button className="rounded border px-2 py-1 text-xs" onClick={() => setStatus(company, "SUSPENDED")}>Suspend</button>}
                  {company.status !== "BLOCKED" && <button className="rounded border px-2 py-1 text-xs" onClick={() => setStatus(company, "BLOCKED")}>Block</button>}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
